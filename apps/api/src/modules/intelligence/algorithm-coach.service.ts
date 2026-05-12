import { Injectable } from '@nestjs/common';
import { getPlatformSpec, type SocialPlatform } from '@inboudly/shared';

export interface CoachingNote {
  severity: 'info' | 'suggestion' | 'warning' | 'critical';
  message: string;
  fix?: string;
}

interface CoachInput {
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  hasImage: boolean;
  hasVideo: boolean;
  videoDurationSec?: number;
  hasCaptionsBurnedIn?: boolean;
  hasTrendingAudio?: boolean;
  language: string;
}

/**
 * Per-platform algorithm coach. Rule-based v1 derived from current research:
 * - Instagram: Mosseri 2025 ranking signals
 * - TikTok: 2025 quality-graded interaction model + first-3-sec hook research
 * - RedNote: CES scoring + search-first behavior
 */
@Injectable()
export class AlgorithmCoachService {
  evaluate(input: CoachInput): CoachingNote[] {
    switch (input.platform) {
      case 'INSTAGRAM':
        return this.coachInstagram(input);
      case 'TIKTOK':
        return this.coachTikTok(input);
      case 'REDNOTE':
        return this.coachRedNote(input);
      case 'LINKEDIN':
        return this.coachLinkedIn(input);
      case 'YOUTUBE':
        return this.coachYouTube(input);
      default:
        return this.coachGeneric(input);
    }
  }

  private coachInstagram(i: CoachInput): CoachingNote[] {
    const notes: CoachingNote[] = [];
    const spec = getPlatformSpec('INSTAGRAM');

    if (i.hasVideo && !i.hasCaptionsBurnedIn) {
      notes.push({
        severity: 'critical',
        message: 'No burned-in captions detected. ~85% of viewers watch with sound off.',
        fix: 'Enable Inboudly auto-captions before publishing. Estimated reach lift: +23%.',
      });
    }
    if (i.hasVideo && (i.videoDurationSec ?? 0) > 60) {
      notes.push({
        severity: 'suggestion',
        message: 'Long Reel — IG rewards retention past 3 seconds, not duration.',
        fix: 'Consider trimming to 15-30s with a stronger 3-sec hook.',
      });
    }
    if (i.hashtags.length === 0) {
      notes.push({
        severity: 'warning',
        message: 'No hashtags. Captions help IG categorize and route content.',
        fix: `Add ${spec.optimalHashtags} relevant hashtags (mix of broad + niche).`,
      });
    } else if (i.hashtags.length > spec.maxHashtags) {
      notes.push({
        severity: 'warning',
        message: `Over the ${spec.maxHashtags} hashtag limit (you have ${i.hashtags.length}).`,
      });
    }
    if (!i.hasTrendingAudio && i.hasVideo) {
      notes.push({
        severity: 'suggestion',
        message: 'No trending audio detected.',
        fix: 'Layer in a trending sound — IG actively boosts Reels using them.',
      });
    }
    const firstLine = i.caption.split('\n')[0] ?? '';
    if (firstLine.length > 125) {
      notes.push({
        severity: 'suggestion',
        message: 'First line is too long — IG truncates after ~125 chars.',
        fix: 'Front-load your hook in the first 100 chars before "see more".',
      });
    }
    return notes;
  }

  private coachTikTok(i: CoachInput): CoachingNote[] {
    const notes: CoachingNote[] = [];
    if (i.hasVideo && (i.videoDurationSec ?? 999) < 3) {
      notes.push({
        severity: 'critical',
        message: 'Video shorter than 3 seconds — TikTok requires minimum 3s.',
      });
    }
    if (i.hasVideo && !i.hasTrendingAudio) {
      notes.push({
        severity: 'warning',
        message: 'No trending audio. 2026 algorithm boosts videos layering 1-3 trending tracks.',
        fix: 'Pick a trending sound from the Inboudly Trend Radar.',
      });
    }
    if (i.hashtags.length > 8) {
      notes.push({
        severity: 'suggestion',
        message: `${i.hashtags.length} hashtags is excessive for TikTok. 5 is optimal.`,
        fix: 'Trim to your 5 most relevant tags. Avoid #fyp / #viral — they\'re ignored as low-quality signals in 2025+.',
      });
    }
    const lower = i.caption.toLowerCase();
    if (/like and follow|drop a comment|smash that/.test(lower)) {
      notes.push({
        severity: 'warning',
        message: 'Engagement-bait phrases detected — TikTok 2025 grades these as low-quality.',
        fix: 'Replace with a genuine question or surprising statement.',
      });
    }
    return notes;
  }

  private coachRedNote(i: CoachInput): CoachingNote[] {
    const notes: CoachingNote[] = [];
    const spec = getPlatformSpec('REDNOTE');

    if (i.language !== 'zh-CN' && i.language !== 'zh-TW') {
      notes.push({
        severity: 'warning',
        message: 'Caption is not in Chinese. RedNote audience is 95%+ Chinese-speaking.',
        fix: 'Switch language to Simplified Chinese (zh-CN).',
      });
    }
    // First-8-character keyword check (titles are critical for RedNote search)
    const firstLine = i.caption.split('\n')[0] ?? '';
    if (firstLine.length < 8) {
      notes.push({
        severity: 'warning',
        message: 'Title/first line too short for RedNote — search relies heavily on title.',
        fix: 'Lead with your main keyword in the first 8 characters.',
      });
    }
    if (i.caption.length < spec.optimalCaptionLength.min) {
      notes.push({
        severity: 'suggestion',
        message: `Body is short (${i.caption.length} chars). RedNote rewards depth — long-form educational content drives Collections (CES weight 1) and Follows (CES weight 8).`,
        fix: `Expand to ${spec.optimalCaptionLength.min}-${spec.optimalCaptionLength.max} characters with substantive content.`,
      });
    }
    if (i.hasImage && i.hasVideo === false) {
      notes.push({
        severity: 'info',
        message: 'Cover image is the #1 driver of click-through on RedNote.',
        fix: 'Use a high-contrast image with bold overlay text in your brand color.',
      });
    }
    return notes;
  }

  private coachLinkedIn(i: CoachInput): CoachingNote[] {
    const notes: CoachingNote[] = [];
    if (i.caption.length < 500) {
      notes.push({
        severity: 'suggestion',
        message: 'LinkedIn rewards long-form storytelling. Aim for 1,300-2,000 chars.',
      });
    }
    const firstTwoLines = i.caption.split('\n').slice(0, 2).join(' ');
    if (firstTwoLines.length < 50 || !firstTwoLines.match(/[?!.]/)) {
      notes.push({
        severity: 'warning',
        message: 'Hook (first 2 lines before "see more") is weak.',
        fix: 'Open with a strong claim, question, or contrarian statement.',
      });
    }
    return notes;
  }

  private coachYouTube(i: CoachInput): CoachingNote[] {
    const notes: CoachingNote[] = [];
    if (!i.hasVideo) {
      notes.push({ severity: 'critical', message: 'YouTube requires video.' });
    }
    if (i.caption.length < 250) {
      notes.push({
        severity: 'suggestion',
        message: 'Short description hurts SEO. Aim for 250-1,000 chars with keywords.',
      });
    }
    return notes;
  }

  private coachGeneric(i: CoachInput): CoachingNote[] {
    const spec = getPlatformSpec(i.platform);
    const notes: CoachingNote[] = [];
    if (i.caption.length > spec.maxCaptionLength) {
      notes.push({
        severity: 'critical',
        message: `Caption exceeds ${spec.maxCaptionLength} chars (${i.caption.length}).`,
      });
    }
    return notes;
  }
}
