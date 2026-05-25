import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
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
 * Content Gap Analysis — uses the workspace's BYOK Claude key to identify
 * topics competitors are winning on. Output is actionable: "they post about
 * X every week and pull big engagement; you don't cover X — here's the angle".
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

  async analyzeContentGap(workspaceId: string, competitorId: string): Promise<ContentGapResult> {
    const apiKey = await this.credentials.getDecryptedKey(workspaceId, 'anthropicKey');
    if (!apiKey) {
      return {
        ok: false,
        gaps: [],
        overallTakeaway: '',
        modelUsed: '',
        message:
          'Content gap analysis needs an Anthropic (Claude) API key. Add one in Settings → AI Providers.',
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

    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: await this.credentials.getModel(workspaceId, 'anthropic'),
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `You are a competitive content strategist analysing one of our workspace's competitors on ${platform.displayName}.

COMPETITOR
Handle: @${competitor.handle}
Display name: ${competitor.displayName ?? '—'}
Their recent top posts (highest engagement):
${competitorTopPosts.length ? competitorTopPosts.map((p, i) => `  ${i + 1}. ${p}`).join('\n') : '  (no snapshot data yet)'}

OUR RECENT POSTS (most recent first):
${ourCaptions.length ? ourCaptions.slice(0, 15).map((c, i) => `  ${i + 1}. ${c.slice(0, 150)}`).join('\n') : '  (no posts yet — give general competitive advice based on competitor patterns)'}

Identify 3-5 CONTENT GAPS — topics or formats where the competitor consistently performs well but we are not covering (or are covering weakly). For each gap, propose a SPECIFIC angle we could take that fits our brand without copying them.

Return STRICT JSON only:
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
}`,
        },
      ],
    });

    const block = res.content.find((c) => c.type === 'text');
    const raw = block?.type === 'text' ? block.text : '';
    const parsed = this.parse(raw);

    return {
      ok: true,
      gaps: parsed.gaps,
      overallTakeaway: parsed.overallTakeaway,
      modelUsed: res.model,
    };
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
