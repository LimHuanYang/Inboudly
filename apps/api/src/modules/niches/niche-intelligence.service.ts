import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { Prisma } from '@inboudly/database';
import type { SocialPlatform, NicheAnalysis } from '@inboudly/database';

export interface RpmBreakdown {
  ads: { min: number; max: number };
  brandDeals: { min: number; max: number };
  affiliate: { min: number; max: number };
  products: { min: number; max: number };
}

export interface AdjacentNiche {
  niche: string;
  reason: string;
  monetizationDelta: 'much higher' | 'higher' | 'similar' | 'lower' | 'much lower';
  audienceOverlap: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'moderate' | 'hard';
}

export interface NicheAnalysisResult {
  ok: boolean;
  cached: boolean;
  niche: string;
  platform: SocialPlatform | null;
  currency: string; // ISO 4217 — what currency the RPM figures are in
  rpm: {
    min: number;
    max: number;
    breakdown: RpmBreakdown;
  } | null;
  scores: {
    saturation: number;
    growth: number;
    monetizationDifficulty: number;
    overall: number;
  } | null;
  summary: string;
  opportunities: string[];
  threats: string[];
  topFormats: string[];
  adjacentNiches: AdjacentNiche[];
  modelUsed?: string;
  analyzedAt?: string;
  message?: string;
}

interface AiNicheResponse {
  summary: string;
  rpm: {
    min: number;
    max: number;
    breakdown: RpmBreakdown;
  };
  scores: {
    saturation: number;
    growth: number;
    monetizationDifficulty: number;
    overall: number;
  };
  opportunities: string[];
  threats: string[];
  topFormats: string[];
  adjacentNiches: AdjacentNiche[];
}

/**
 * Niche Intelligence — uses the workspace's BYOK text AI to analyse a
 * niche's monetization potential, health, and adjacent opportunities.
 *
 * Single AI call returns the full bundle: RPM estimates + breakdown,
 * health scores, opportunities, threats, top-performing formats, and
 * 3-5 adjacent niches with monetization delta + audience overlap.
 *
 * Results cached 7 days per (workspaceId, niche, platform). Re-runs
 * within the TTL return the cached row instantly; pass force=true to
 * regenerate.
 */
@Injectable()
export class NicheIntelligenceService {
  private readonly logger = new Logger(NicheIntelligenceService.name);
  private readonly CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
  ) {}

  async list(workspaceId: string, limit = 20): Promise<NicheAnalysis[]> {
    return this.prisma.nicheAnalysis.findMany({
      where: { workspaceId },
      orderBy: { analyzedAt: 'desc' },
      take: limit,
    });
  }

  async analyze(
    workspaceId: string,
    niche: string,
    platform: SocialPlatform | null = null,
    force = false,
  ): Promise<NicheAnalysisResult> {
    const normalized = niche.trim().toLowerCase();
    if (!normalized) throw new BadRequestException('Niche is required');

    // The workspace currency drives the AI's RPM estimates. Read it once;
    // default to USD if the workspace somehow lacks one.
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { currency: true },
    });
    const currency = ws?.currency ?? 'USD';

    // Cache lookup unless force=true. We use findFirst (not findUnique) because
    // `platform` is nullable in the compound key — Prisma's findUnique input
    // type rejects null, and SQL treats NULL as distinct anyway.
    // Also bypass the cache if the stored currency differs from the current
    // workspace currency — the figures would be in the wrong currency.
    if (!force) {
      const cached = await this.prisma.nicheAnalysis.findFirst({
        where: { workspaceId, niche: normalized, platform },
      });
      if (
        cached &&
        cached.currency === currency &&
        Date.now() - cached.analyzedAt.getTime() < this.CACHE_TTL_MS
      ) {
        return this.toResult(cached, true);
      }
    }

    // Fresh analysis via BYOK
    const resolved = await this.credentials.resolveTextProvider(workspaceId);
    if (!resolved) {
      return {
        ok: false,
        cached: false,
        niche: normalized,
        platform,
        currency,
        rpm: null,
        scores: null,
        summary: '',
        opportunities: [],
        threats: [],
        topFormats: [],
        adjacentNiches: [],
        message:
          'Niche analysis needs a text AI provider. Add an Anthropic (Claude) or Google (Gemini) API key in Settings → AI Providers.',
      };
    }

    const prompt = this.buildPrompt(normalized, platform, currency);

    let raw: string;
    let modelUsed: string;
    try {
      if (resolved.provider === 'claude') {
        const client = new Anthropic({ apiKey: resolved.apiKey });
        const res = await client.messages.create({
          model: resolved.model,
          max_tokens: 3072,
          temperature: 0.4, // analysis benefits from determinism
          messages: [{ role: 'user', content: prompt }],
        });
        const block = res.content.find((c) => c.type === 'text');
        raw = block?.type === 'text' ? block.text : '';
        modelUsed = res.model;
      } else {
        const client = new GoogleGenerativeAI(resolved.apiKey);
        const model = client.getGenerativeModel({
          model: resolved.model,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.4,
            maxOutputTokens: 3072,
          },
        });
        const res = await model.generateContent(prompt);
        raw = res.response.text();
        modelUsed = resolved.model;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Niche analysis failed (${resolved.provider}): ${msg}`);
      return {
        ok: false,
        cached: false,
        niche: normalized,
        platform,
        currency,
        rpm: null,
        scores: null,
        summary: '',
        opportunities: [],
        threats: [],
        topFormats: [],
        adjacentNiches: [],
        modelUsed: resolved.model,
        message: `${resolved.provider === 'claude' ? 'Claude' : 'Gemini'} request failed: ${msg}`,
      };
    }

    const parsed = this.parse(raw);
    if (!parsed) {
      return {
        ok: false,
        cached: false,
        niche: normalized,
        platform,
        currency,
        rpm: null,
        scores: null,
        summary: '',
        opportunities: [],
        threats: [],
        topFormats: [],
        adjacentNiches: [],
        modelUsed,
        message: 'AI returned an unparseable response. Try again or switch provider.',
      };
    }

    // Manual upsert — can't use prisma.upsert() because the compound unique
    // key includes the nullable `platform` field (see cache-lookup note above).
    // Shared field payload, cast JSON to Prisma.InputJsonValue.
    const fields = {
      currency,
      estimatedRpmMin: parsed.rpm.min,
      estimatedRpmMax: parsed.rpm.max,
      rpmBreakdownJson: parsed.rpm.breakdown as unknown as Prisma.InputJsonValue,
      saturationScore: parsed.scores.saturation,
      growthScore: parsed.scores.growth,
      monetizationDifficulty: parsed.scores.monetizationDifficulty,
      overallScore: parsed.scores.overall,
      summary: parsed.summary,
      opportunities: parsed.opportunities.slice(0, 5),
      threats: parsed.threats.slice(0, 4),
      topFormats: parsed.topFormats.slice(0, 6),
      adjacentNichesJson: parsed.adjacentNiches.slice(0, 5) as unknown as Prisma.InputJsonValue,
      modelUsed,
    };

    const existing = await this.prisma.nicheAnalysis.findFirst({
      where: { workspaceId, niche: normalized, platform },
      select: { id: true },
    });

    const saved = existing
      ? await this.prisma.nicheAnalysis.update({
          where: { id: existing.id },
          data: { ...fields, analyzedAt: new Date() },
        })
      : await this.prisma.nicheAnalysis.create({
          data: { workspaceId, niche: normalized, platform, ...fields },
        });

    return this.toResult(saved, false);
  }

  async deleteCached(workspaceId: string, id: string): Promise<void> {
    const row = await this.prisma.nicheAnalysis.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new BadRequestException('Analysis not found');
    await this.prisma.nicheAnalysis.delete({ where: { id } });
  }

  // ----------------------------------------------------------------

  private toResult(row: NicheAnalysis, cached: boolean): NicheAnalysisResult {
    const breakdown = (row.rpmBreakdownJson as RpmBreakdown | null) ?? null;
    const adjacent = (row.adjacentNichesJson as AdjacentNiche[] | null) ?? [];
    return {
      ok: true,
      cached,
      niche: row.niche,
      platform: row.platform,
      currency: row.currency,
      rpm:
        row.estimatedRpmMin !== null && row.estimatedRpmMax !== null && breakdown
          ? {
              min: Number(row.estimatedRpmMin),
              max: Number(row.estimatedRpmMax),
              breakdown,
            }
          : null,
      scores:
        row.saturationScore !== null &&
        row.growthScore !== null &&
        row.monetizationDifficulty !== null &&
        row.overallScore !== null
          ? {
              saturation: row.saturationScore,
              growth: row.growthScore,
              monetizationDifficulty: row.monetizationDifficulty,
              overall: row.overallScore,
            }
          : null,
      summary: row.summary ?? '',
      opportunities: row.opportunities,
      threats: row.threats,
      topFormats: row.topFormats,
      adjacentNiches: adjacent,
      modelUsed: row.modelUsed ?? undefined,
      analyzedAt: row.analyzedAt.toISOString(),
    };
  }

  private buildPrompt(niche: string, platform: SocialPlatform | null, currency: string): string {
    const platformLine = platform
      ? `Focus on ${platform} specifically — RPM, formats, and opportunities should reflect ${platform}'s monetization model.`
      : 'Cross-platform analysis — give the typical range across major social platforms.';

    return `You are a creator-economy analyst specialising in niche monetization, audience dynamics, and content strategy.

Analyse this niche: "${niche}"
${platformLine}

ALL monetary values (RPM + breakdown) MUST be estimated natively in ${currency} — NOT converted from USD. Reason about what creators in this niche actually earn in ${currency} markets, accounting for regional ad rates and brand-deal economics. Output raw numbers only (no currency symbols in the JSON).

Return a strict JSON object with these fields:

{
  "summary": "One-paragraph executive summary (3-5 sentences) of the niche's commercial appeal, audience characteristics, and current market position.",
  "rpm": {
    "min": <number, lower-bound $ RPM>,
    "max": <number, upper-bound $ RPM>,
    "breakdown": {
      "ads":        { "min": <$ per 1k views from platform ads>, "max": <$> },
      "brandDeals": { "min": <$ per 1k views from sponsored content>, "max": <$> },
      "affiliate":  { "min": <$ per 1k views from affiliate>, "max": <$> },
      "products":   { "min": <$ per 1k views from own products>, "max": <$> }
    }
  },
  "scores": {
    "saturation":             <0-100, higher = MORE saturated/competitive>,
    "growth":                 <0-100, higher = niche growing FAST>,
    "monetizationDifficulty": <0-100, higher = HARDER to monetize>,
    "overall":                <0-100 composite, higher = better opportunity>
  },
  "opportunities": [
    <3-5 specific actionable opportunities a new creator could exploit — be concrete, not generic>
  ],
  "threats": [
    <2-3 risks to watch: platform changes, saturation timing, demonetization risk, etc.>
  ],
  "topFormats": [
    <4-6 best-performing content formats for this niche — e.g. "Reels series", "long-form YouTube tutorials", "before/after carousels">
  ],
  "adjacentNiches": [
    {
      "niche":             "<adjacent niche name>",
      "reason":            "<one sentence why it's adjacent + opportunity vs this niche>",
      "monetizationDelta": "much higher" | "higher" | "similar" | "lower" | "much lower",
      "audienceOverlap":   "high" | "medium" | "low",
      "difficulty":        "easy" | "moderate" | "hard"
    }
    <3-5 entries>
  ]
}

GUIDELINES
- Use realistic, current (2026) RPM ranges in ${currency}. As a RELATIVE-magnitude reference (these are USD figures — scale to ${currency} market rates): YouTube long-form gaming ~$2-8, finance ~$15-35, kids ~$0.50-2 (limited monetization); TikTok creator fund ~$0.02-0.04 per 1k views regardless of niche. Preserve the relative spread between niches, but express final numbers in ${currency}.
- "saturation" scoring: <30 = blue-ocean opportunity, 30-60 = competitive but findable, 60-85 = crowded, >85 = saturated.
- "growth" scoring: >70 = rising fast (breakout window), 40-70 = steady, <40 = flat or declining.
- Adjacent niches should be GENUINELY adjacent (audience would care about both), not just random alternatives.

Return STRICT JSON only — no prose, no markdown fences.`;
  }

  private parse(raw: string): AiNicheResponse | null {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      // Minimal shape validation — accept partial responses gracefully
      if (
        typeof parsed?.summary === 'string' &&
        parsed?.rpm?.breakdown &&
        parsed?.scores &&
        Array.isArray(parsed?.opportunities) &&
        Array.isArray(parsed?.threats) &&
        Array.isArray(parsed?.topFormats) &&
        Array.isArray(parsed?.adjacentNiches)
      ) {
        return parsed as AiNicheResponse;
      }
      return null;
    } catch {
      return null;
    }
  }
}
