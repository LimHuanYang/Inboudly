import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { Transcript } from './transcription.service';
import type { SocialPlatform } from '@inboudly/shared';
import { getPlatformSpec } from '@inboudly/shared';

const MODEL = 'claude-sonnet-4-6';

export interface SelectedClip {
  /** Index into the original transcript segments array */
  startSegmentIndex: number;
  endSegmentIndex: number;
  /** Seconds — used to drive ffmpeg cuts */
  startSec: number;
  endSec: number;
  /** Suggested platform-specific caption for this clip */
  caption: string;
  /** Why this clip was selected — shown to user as "AI rationale" */
  rationale: string;
  /** Estimated virality score 0-100 */
  estimatedScore: number;
}

/**
 * Claude clip selector.
 *
 * Implementation follows the "Minimal Clips, Maximum Salience" research
 * (arXiv 2512.11399): instead of asking the LLM to operate on raw video,
 * we feed it a structured transcript and let it pick the highest-salience
 * windows that satisfy each target platform's optimal duration.
 *
 * The result is a list of clips per platform — TikTok / Reels prefer
 * 15-30s with a 3-second hook; YouTube Shorts will take up to 60s.
 */
@Injectable()
export class ClipSelectorService {
  private readonly logger = new Logger(ClipSelectorService.name);
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async selectClips(
    transcript: Transcript,
    platforms: SocialPlatform[],
    maxClipsPerPlatform: number,
  ): Promise<Record<SocialPlatform, SelectedClip[]>> {
    const result: Record<string, SelectedClip[]> = {};

    // We process each platform in one Claude call — keeps token usage tight.
    for (const platform of platforms) {
      const spec = getPlatformSpec(platform);
      const targetDuration = this.targetDurationFor(platform);

      const segmentsBlock = transcript.segments
        .map((s, i) => `[${i}] ${this.fmt(s.start)}-${this.fmt(s.end)} ${s.text}`)
        .join('\n');

      const prompt = `You are an expert short-form content editor. Select the ${maxClipsPerPlatform} most viral clips from this transcript for ${spec.displayName}.

PLATFORM: ${spec.displayName}
TARGET CLIP DURATION: ${targetDuration.min}-${targetDuration.max} seconds
PLATFORM ALGORITHM: prioritises ${spec.topRankingSignals.join(', ')}.

Each clip must:
- Start with a strong 3-second hook (question, surprise, contrarian claim)
- Be self-contained (viewer can understand without prior context)
- End on a natural cadence (not mid-sentence)
- Stay within the target duration window

TRANSCRIPT (segment_index | start-end | text):
${segmentsBlock}

OUTPUT — strict JSON only:
{
  "clips": [
    {
      "startSegmentIndex": <int>,
      "endSegmentIndex": <int>,
      "caption": "platform-optimised caption for this clip",
      "rationale": "why this clip will perform on ${spec.displayName}",
      "estimatedScore": <0-100>
    }
  ]
}`;

      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = res.content.find((c) => c.type === 'text');
      const raw = block?.type === 'text' ? block.text : '';
      const parsed = this.parseClips(raw, transcript);
      result[platform] = parsed.slice(0, maxClipsPerPlatform);
    }

    return result as Record<SocialPlatform, SelectedClip[]>;
  }

  private targetDurationFor(platform: SocialPlatform): { min: number; max: number } {
    switch (platform) {
      case 'TIKTOK':
      case 'INSTAGRAM':
      case 'REDNOTE':
        return { min: 15, max: 45 };
      case 'YOUTUBE':
        return { min: 30, max: 60 }; // Shorts
      case 'LINKEDIN':
        return { min: 30, max: 90 };
      default:
        return { min: 15, max: 60 };
    }
  }

  private fmt(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  private parseClips(raw: string, transcript: Transcript): SelectedClip[] {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    let parsed: { clips?: Array<Record<string, unknown>> } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      this.logger.warn('Could not parse Claude clip output, returning empty list');
      return [];
    }
    return (parsed.clips ?? [])
      .map((c) => {
        const startIdx = Number(c.startSegmentIndex);
        const endIdx = Number(c.endSegmentIndex);
        const startSeg = transcript.segments[startIdx];
        const endSeg = transcript.segments[endIdx];
        if (!startSeg || !endSeg) return null;
        return {
          startSegmentIndex: startIdx,
          endSegmentIndex: endIdx,
          startSec: startSeg.start,
          endSec: endSeg.end,
          caption: String(c.caption ?? ''),
          rationale: String(c.rationale ?? ''),
          estimatedScore: Math.max(0, Math.min(100, Number(c.estimatedScore) || 50)),
        } as SelectedClip;
      })
      .filter((c): c is SelectedClip => c !== null);
  }
}
