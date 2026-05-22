import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VoiceTrainingService } from '../brand/voice-training.service';
import { getPlatformSpec, type SocialPlatform } from '@inboudly/shared';

const MODEL = 'gemini-2.5-flash';

interface GeneratedVariant {
  caption: string;
  hashtags: string[];
  cta?: string;
  hook?: string;
  rationale?: string;
}

/**
 * BYOK: per-call API key. The caller (AiController) looks up the workspace's
 * encrypted Gemini key, decrypts it, and passes it in. Each customer pays
 * Google directly.
 */
@Injectable()
export class GeminiTextService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => VoiceTrainingService))
    private voiceTraining: VoiceTrainingService,
  ) {}

  async generatePostText(
    apiKey: string,
    params: {
      workspaceId: string;
      brandVoiceId?: string;
      platform: SocialPlatform;
      prompt: string;
      language?: string;
      variations?: number;
      referenceUrl?: string;
    },
  ): Promise<{ variants: GeneratedVariant[]; model: string; tokensUsed: number }> {
    const client = new GoogleGenerativeAI(apiKey);
    const spec = getPlatformSpec(params.platform);

    const brandVoice = params.brandVoiceId
      ? await this.prisma.brandVoice.findUnique({ where: { id: params.brandVoiceId } })
      : await this.prisma.brandVoice.findFirst({
          where: { workspaceId: params.workspaceId, isDefault: true },
        });

    const lang = params.language ?? spec.primaryLanguage;
    const variations = params.variations ?? 3;

    const exemplars = brandVoice
      ? await this.voiceTraining.retrieveExamples(brandVoice.id, params.prompt, 5)
      : [];

    const system = this.buildSystemPrompt(spec, brandVoice, lang, exemplars);
    const user = this.buildUserPrompt(params.prompt, params.platform, variations, params.referenceUrl);

    const model = client.getGenerativeModel({
      model: MODEL,
      systemInstruction: system,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.9,
      },
    });

    const res = await model.generateContent(user);
    const raw = res.response.text();
    const variants = this.parseVariants(raw);
    const usage = res.response.usageMetadata;
    const tokensUsed = (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0);

    return { variants, model: MODEL, tokensUsed };
  }

  private buildSystemPrompt(
    spec: ReturnType<typeof getPlatformSpec>,
    brandVoice: {
      toneTags: string[];
      perspective: string | null;
      emojiUsage: string | null;
      styleNotes: string | null;
      bannedWords: string[];
    } | null,
    lang: string,
    exemplars: Array<{ text: string; score: number; platform?: string; topic?: string }> = [],
  ) {
    const tones = brandVoice?.toneTags?.length ? brandVoice.toneTags.join(', ') : 'authentic, engaging';
    const perspective = brandVoice?.perspective ?? 'we';
    const emoji = brandVoice?.emojiUsage ?? 'minimal';
    const banned = brandVoice?.bannedWords?.length ? brandVoice.bannedWords.join(', ') : 'none';
    const notes = brandVoice?.styleNotes ?? '';

    const exemplarsBlock = exemplars.length
      ? `\nBRAND VOICE EXEMPLARS — past posts that performed well for this brand. Match tone, rhythm, and vocabulary. Do not copy verbatim.\n${exemplars
          .map((e, i) => `[Example ${i + 1}${e.platform ? ` · ${e.platform}` : ''}]\n${e.text}`)
          .join('\n\n')}\n`
      : '';

    return `You are Inboudly's expert social-media content writer.

PLATFORM: ${spec.displayName}
LANGUAGE: ${lang}
CAPTION LENGTH: aim for ${spec.optimalCaptionLength.min}-${spec.optimalCaptionLength.max} chars (max ${spec.maxCaptionLength}).
HASHTAGS: ${spec.optimalHashtags} optimal (max ${spec.maxHashtags}).

BRAND VOICE
Tone: ${tones}
Perspective: ${perspective}
Emoji usage: ${emoji}
Banned words: ${banned}
Style notes: ${notes}
${exemplarsBlock}
PLATFORM ALGORITHM INTELLIGENCE
${this.platformAlgorithmGuidance(spec.id)}

OUTPUT FORMAT — strict JSON only, no prose around it:
{
  "variants": [
    {
      "caption": "...",
      "hashtags": ["...", "..."],
      "cta": "...",
      "hook": "the first 3 seconds / first line",
      "rationale": "why this will perform well per the platform algorithm"
    }
  ]
}`;
  }

  private buildUserPrompt(prompt: string, platform: SocialPlatform, variations: number, referenceUrl?: string) {
    const refSection = referenceUrl ? `\nReference URL (for context): ${referenceUrl}\n` : '';
    return `Generate ${variations} caption variants for ${platform} based on this brief:

"${prompt}"
${refSection}
Each variant must be distinct in angle, hook, or framing. Return strict JSON.`;
  }

  private platformAlgorithmGuidance(platform: SocialPlatform): string {
    switch (platform) {
      case 'INSTAGRAM':
        return `Top ranking signals (2026): DM shares > saves > watch time > comments > likes.
- Lead with a 3-second hook that creates curiosity.
- Write captions designed to be SHARED via DM (insightful, surprising, or quotable).
- Captions help IG categorize content — be specific about the topic.`;
      case 'TIKTOK':
        return `Top ranking signals: watch time, replays, shares, completion rate.
- Open with tension: a question, an unexpected claim, a visual cliffhanger.
- TikTok 2025 grades interactions on quality, not quantity.
- Captions are searchable metadata — include 1-2 high-intent search keywords naturally.`;
      case 'REDNOTE':
        return `RedNote uses CES scoring: Comments=4pts, Shares=4pts, Follows=8pts, Likes=1pt, Collections=1pt.
- 60% of users use RedNote as a SEARCH ENGINE — structure caption around real search queries.
- Title is critical — main keyword in first 8 characters.
- Authenticity beats polish: real experiences, honest reviews, before/after framing.
- Aim for 200-600 characters of substantive content.
- Use Simplified Chinese unless user requests otherwise.`;
      case 'LINKEDIN':
        return `Top signals: dwell time, comments, shares. Long-form storytelling wins.`;
      case 'YOUTUBE':
        return `Top signals: click-through rate, watch time, session duration. Front-load keywords.`;
      default:
        return `Optimize for the platform's primary engagement signals.`;
    }
  }

  private parseVariants(raw: string): GeneratedVariant[] {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.variants)) return parsed.variants;
    } catch {
      // fall through
    }
    return [{ caption: raw, hashtags: [] }];
  }
}
