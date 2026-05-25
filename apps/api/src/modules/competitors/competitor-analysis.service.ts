import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { getPlatformSpec } from '@inboudly/shared';

export interface ContentGapResult {
  ok: boolean;
  // Each gap = a topic the competitor wins on that the workspace doesn't cover
  gaps: Array<{
    topic: string;
    competitorAdvantage: string;
    suggestedAngle: string;
    estimatedDifficulty: 'low' | 'medium' | 'high';
  }>;
  overallTakeaway: string;
  modelUsed: string;
  message?: string;
}

/**
 * Content Gap Analysis — provider-agnostic via the workspace's BYOK keys.
 *
 * Picks whichever text AI is configured (Claude or Gemini), driven by the
 * shared resolver in AiCredentialsService.resolveTextProvider. This matches
 * the BYOK contract used by Composer and Repurpose — no feature should
 * require a specific provider; users bring whichever key they have.
 *
 * Inputs: competitor's recent top posts (from snapshot) + workspace's own
 *   recent posts. Output: list of gaps + suggested response angles.
 */
@Injectable()
export class CompetitorAnalysisService {
  private readonly logger = new Logger(CompetitorAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
  ) {}

  async analyzeContentGap(
    workspaceId: string,
    competitorId: string,
    // Optional per-call override. If omitted, uses the workspace's
    // preferred provider (or first available). If specified but that
    // provider's key isn't configured, returns a clear error instead
    // of silently falling back — the user explicitly chose it.
    providerOverride?: 'claude' | 'gemini',
  ): Promise<ContentGapResult> {
    const resolved = providerOverride
      ? await this.resolveSpecificProvider(workspaceId, providerOverride)
      : await this.credentials.resolveTextProvider(workspaceId);

    if (!resolved) {
      return {
        ok: false,
        gaps: [],
        overallTakeaway: '',
        modelUsed: '',
        message: providerOverride
          ? `You selected ${providerOverride === 'claude' ? 'Claude' : 'Gemini'} but no ${providerOverride === 'claude' ? 'Anthropic' : 'Google'} key is configured for this workspace. Add one in Settings → AI Providers, or pick a different provider.`
          : 'Content gap analysis needs a text AI provider. Add an Anthropic (Claude) or Google (Gemini) API key in Settings → AI Providers.',
      };
    }

    const [competitor, ourPosts] = await Promise.all([
      this.prisma.competitor.findUnique({
        where: { id: competitorId },
        include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 5 } },
      }),
      this.prisma.post.findMany({
        where: { workspaceId, status: { in: ['PUBLISHED', 'SCHEDULED', 'DRAFT'] } },
        include: { variants: { select: { caption: true, platform: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    if (!competitor) {
      return { ok: false, gaps: [], overallTakeaway: '', modelUsed: '', message: 'Competitor not found' };
    }

    const competitorTopPosts = competitor.snapshots
      .flatMap((s) => {
        const tj = s.topPostsJson as { top3?: string[] } | null;
        return tj?.top3 ?? [];
      })
      .slice(0, 10);

    const ourCaptions = ourPosts
      .flatMap((p) => p.variants.map((v) => v.caption))
      .filter(Boolean)
      .slice(0, 20);

    const platform = getPlatformSpec(competitor.platform);

    // The prompt itself is provider-agnostic. Both Claude and Gemini handle
    // it well — we just need to call the right SDK and parse the response.
    const prompt = this.buildPrompt({
      platformName: platform.displayName,
      competitorHandle: competitor.handle,
      competitorDisplayName: competitor.displayName,
      competitorTopPosts,
      ourCaptions,
    });

    try {
      const { raw, modelUsed } =
        resolved.provider === 'claude'
          ? await this.callClaude(resolved.apiKey, resolved.model, prompt)
          : await this.callGemini(resolved.apiKey, resolved.model, prompt);

      const parsed = this.parse(raw);
      return {
        ok: true,
        gaps: parsed.gaps,
        overallTakeaway: parsed.overallTakeaway,
        modelUsed,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gap analysis failed (${resolved.provider}): ${msg}`);
      return {
        ok: false,
        gaps: [],
        overallTakeaway: '',
        modelUsed: resolved.model,
        message: `${resolved.provider === 'claude' ? 'Claude' : 'Gemini'} request failed: ${msg}`,
      };
    }
  }

  /**
   * Returns the resolved provider only if the user-requested one has a key.
   * Used when the caller explicitly picks Claude or Gemini at request time
   * (we don't silently fall back — they chose deliberately).
   */
  private async resolveSpecificProvider(
    workspaceId: string,
    provider: 'claude' | 'gemini',
  ) {
    const keyField = provider === 'claude' ? 'anthropicKey' : 'geminiKey';
    const modelKey = provider === 'claude' ? 'anthropic' : 'gemini';
    const apiKey = await this.credentials.getDecryptedKey(workspaceId, keyField);
    if (!apiKey) return null;
    const model = await this.credentials.getModel(workspaceId, modelKey);
    return { provider, apiKey, model } as const;
  }

  private async callClaude(
    apiKey: string,
    model: string,
    prompt: string,
  ): Promise<{ raw: string; modelUsed: string }> {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 2048,
      // Lower temperature — analysis benefits from determinism over creativity.
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = res.content.find((c) => c.type === 'text');
    return {
      raw: block?.type === 'text' ? block.text : '',
      modelUsed: res.model,
    };
  }

  private async callGemini(
    apiKey: string,
    modelName: string,
    prompt: string,
  ): Promise<{ raw: string; modelUsed: string }> {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        // Gemini's native JSON-mode — guarantees parsable output.
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });
    const res = await model.generateContent(prompt);
    return {
      raw: res.response.text(),
      modelUsed: modelName,
    };
  }

  private buildPrompt(args: {
    platformName: string;
    competitorHandle: string;
    competitorDisplayName: string | null;
    competitorTopPosts: string[];
    ourCaptions: string[];
  }): string {
    const competitorPostsBlock = args.competitorTopPosts.length
      ? args.competitorTopPosts.map((p, i) => `  ${i + 1}. ${p}`).join('\n')
      : '  (no snapshot data yet)';

    const ourPostsBlock = args.ourCaptions.length
      ? args.ourCaptions.slice(0, 15).map((c, i) => `  ${i + 1}. ${c.slice(0, 150)}`).join('\n')
      : '  (no posts yet — give general competitive advice based on competitor patterns)';

    return `You are a competitive content strategist analysing one of our workspace's competitors on ${args.platformName}.

COMPETITOR
Handle: @${args.competitorHandle}
Display name: ${args.competitorDisplayName ?? '—'}
Their recent top posts (highest engagement):
${competitorPostsBlock}

OUR RECENT POSTS (most recent first):
${ourPostsBlock}

Identify 3-5 CONTENT GAPS — topics or formats where the competitor consistently performs well but we are not covering (or are covering weakly). For each gap, propose a SPECIFIC angle we could take that fits our brand without copying them.

Return STRICT JSON only, no markdown fences, no prose around it:
{
  "gaps": [
    {
      "topic": "short description of the topic competitor wins on",
      "competitorAdvantage": "what specifically they're doing that works",
      "suggestedAngle": "the angle WE should take — different from theirs, fits our voice",
      "estimatedDifficulty": "low" | "medium" | "high"
    }
  ],
  "overallTakeaway": "one-sentence strategic summary the user should remember"
}`;
  }

  private parse(raw: string): { gaps: ContentGapResult['gaps']; overallTakeaway: string } {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        gaps: Array.isArray(parsed?.gaps) ? parsed.gaps : [],
        overallTakeaway: typeof parsed?.overallTakeaway === 'string' ? parsed.overallTakeaway : '',
      };
    } catch {
      return { gaps: [], overallTakeaway: 'Could not parse AI response' };
    }
  }
}
