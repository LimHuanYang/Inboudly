import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getPlatformSpec, type SocialPlatform } from '@inboudly/shared';

const MODEL = 'claude-sonnet-4-6';

interface GeneratedVariant {
  caption: string;
  hashtags: string[];
  cta?: string;
  hook?: string;
  rationale?: string;
}

@Injectable()
export class ClaudeTextService {
  private client: Anthropic;

  constructor(private prisma: PrismaService) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generatePostText(params: {
    workspaceId: string;
    brandVoiceId?: string;
    platform: SocialPlatform;
    prompt: string;
    language?: string;
    variations?: number;
    referenceUrl?: string;
  }): Promise<{ variants: GeneratedVariant[]; model: string; tokensUsed: number }> {
    const spec = getPlatformSpec(params.platform);

    const brandVoice = params.brandVoiceId
      ? await this.prisma.brandVoice.findUnique({ where: { id: params.brandVoiceId } })
      : await this.prisma.brandVoice.findFirst({
          where: { workspaceId: params.workspaceId, isDefault: true },
        });

    const lang = params.language ?? spec.primaryLanguage;
    const variations = params.variations ?? 3;

    const system = this.buildSystemPrompt(spec, brandVoice, lang);
    const user = this.buildUserPrompt(params.prompt, params.platform, variations, params.referenceUrl);

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    const raw = textBlock?.type === 'text' ? textBlock.text : '';
    const variants = this.parseVariants(raw);

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

    return { variants, model: MODEL, tokensUsed };
  }

  private buildSystemPrompt(
    spec: ReturnType<typeof getPlatformSpec>,
    brandVoice: { toneTags: string[]; perspective: string | null; emojiUsage: string | null; styleNotes: string | null; bannedWords: string[] } | null,
    lang: string,
  ) {
    const tones = brandVoice?.toneTags?.length ? brandVoice.toneTags.join(', ') : 'authentic, engaging';
    const perspective = brandVoice?.perspective ?? 'we';
    const emoji = brandVoice?.emojiUsage ?? 'minimal';
    const banned = brandVoice?.bannedWords?.length ? brandVoice.bannedWords.join(', ') : 'none';
    const notes = brandVoice?.styleNotes ?? '';

    const platformGuidance = this.platformAlgorithmGuidance(spec.id);

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

PLATFORM ALGORITHM INTELLIGENCE
${platformGuidance}

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
    const refSection = referenceUrl ? `\nReference URL (read for context): ${referenceUrl}\n` : '';
    return `Generate ${variations} caption variants for ${platform} based on this brief:

"${prompt}"
${refSection}
Each variant must be distinct in angle, hook, or framing. Return strict JSON.`;
  }

  /**
   * Per-platform algorithm intelligence baked into the system prompt.
   * Sources: Mosseri 2025 (IG), TikTok 2025 algorithm update, Xiaohongshu CES research.
   */
  private platformAlgorithmGuidance(platform: SocialPlatform): string {
    switch (platform) {
      case 'INSTAGRAM':
        return `Top ranking signals (2026): DM shares > saves > watch time > comments > likes.
- Lead with a 3-second hook that creates curiosity.
- Write captions designed to be SHARED via DM (insightful, surprising, or quotable).
- Use trending audio cues in the rationale if it's a Reel.
- Captions help IG categorize content — be specific about the topic.`;
      case 'TIKTOK':
        return `Top ranking signals: watch time, replays, shares, completion rate.
- Open with tension: a question, an unexpected claim, a visual cliffhanger.
- TikTok 2025 grades interactions on quality, not quantity. Avoid generic engagement bait.
- Suggest layering 1-3 trending sounds in the rationale.
- Captions are searchable metadata — include 1-2 high-intent search keywords naturally.`;
      case 'REDNOTE':
        return `RedNote uses CES scoring: Comments=4pts, Shares=4pts, Follows=8pts, Likes=1pt, Collections=1pt.
- 60% of users use RedNote as a SEARCH ENGINE — structure caption around real search queries.
- Title is critical — main keyword in first 8 characters.
- Authenticity beats polish: real experiences, honest reviews, before/after framing.
- Aim for 200-600 characters of substantive content (long-form educational performs best).
- Use Simplified Chinese unless user requests otherwise.`;
      case 'LINKEDIN':
        return `Top signals: dwell time, comments, shares.
- Long-form storytelling outperforms short posts.
- Hook line (first 2 lines before "see more") must compel a click.
- End with a discussion-starting question.`;
      case 'YOUTUBE':
        return `Top signals: click-through rate, watch time, session duration.
- Title must promise specific value — avoid clickbait.
- Description front-loads keywords in the first 150 chars.`;
      default:
        return `Optimize for the platform's primary engagement signals: substantive content, clear value proposition, native format.`;
    }
  }

  private parseVariants(raw: string): GeneratedVariant[] {
    // Strip code fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed?.variants)) return parsed.variants;
    } catch {
      // fall through
    }
    // Fallback: return raw text as a single variant
    return [{ caption: raw, hashtags: [] }];
  }
}
