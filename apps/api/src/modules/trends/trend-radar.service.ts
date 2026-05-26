import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import type { SocialPlatform, TrendVelocity, Trend } from '@inboudly/database';
import { getPlatformSpec } from '@inboudly/shared';

export interface ListFilters {
  platform?: SocialPlatform;
  category?: string;
  velocity?: TrendVelocity;
  /** Hide trends with freshness < minFreshness. Default 30. */
  minFreshness?: number;
}

export interface GenerateResult {
  ok: boolean;
  created: number;
  modelUsed?: string;
  message?: string;
}

interface AiTrend {
  topic: string;
  category: string;
  description: string;
  velocity: 'BREAKOUT' | 'RISING' | 'SUSTAINED' | 'DECLINING';
  estimatedReach: number;
  suggestedAngles: string[];
  hashtags: string[];
  exampleHandles: string[];
}

/**
 * Trend Radar — discovers trending topics/formats per platform and surfaces
 * them as actionable Composer prompts.
 *
 * v1: AI-generated trends via the workspace's BYOK text provider (Claude or
 *     Gemini, picked by the shared resolver in AiCredentialsService).
 * v2 (future): plug in real trend APIs (TrendsAPI, RisingWave, etc.) and
 *     reconcile with AI-enriched context. The Trend.source field is in place
 *     so AI_GENERATED vs API_SCRAPER can coexist.
 *
 * Freshness model: every trend starts at 100, decays daily (rough heuristic).
 * Trends below 30 freshness are hidden from the default list. expiresAt is a
 * hard 7-day TTL; after that they're filtered out regardless.
 */
@Injectable()
export class TrendRadarService {
  private readonly logger = new Logger(TrendRadarService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
  ) {}

  async list(workspaceId: string, filters: ListFilters = {}): Promise<Trend[]> {
    const minFreshness = filters.minFreshness ?? 30;
    return this.prisma.trend.findMany({
      where: {
        workspaceId,
        isDismissed: false,
        expiresAt: { gt: new Date() },
        freshnessScore: { gte: minFreshness },
        ...(filters.platform && { platform: filters.platform }),
        // Partial, case-insensitive match so "fit" finds "fitness" and
        // "fitness-tech". Users can type any category they want — the
        // categories aren't a fixed enum, they're free strings.
        ...(filters.category && {
          category: { contains: filters.category, mode: 'insensitive' as const },
        }),
        ...(filters.velocity && { velocity: filters.velocity }),
      },
      orderBy: [{ freshnessScore: 'desc' }, { detectedAt: 'desc' }],
    });
  }

  async getById(id: string, workspaceId: string): Promise<Trend> {
    const trend = await this.prisma.trend.findFirst({
      where: { id, workspaceId },
    });
    if (!trend) throw new NotFoundException('Trend not found');
    return trend;
  }

  async dismiss(id: string, workspaceId: string): Promise<Trend> {
    await this.getById(id, workspaceId); // assert ownership
    return this.prisma.trend.update({
      where: { id },
      data: { isDismissed: true },
    });
  }

  /**
   * Generate ~count trends for a platform using the workspace's text AI.
   * Idempotent in spirit: re-running won't dedupe (each call adds fresh
   * trends), but stale trends are pruned via the freshness/expiry model.
   * Returns { ok: false } with a friendly message if no AI provider is set.
   */
  async generate(
    workspaceId: string,
    platform: SocialPlatform,
    count = 15,
  ): Promise<GenerateResult> {
    const resolved = await this.credentials.resolveTextProvider(workspaceId);
    if (!resolved) {
      return {
        ok: false,
        created: 0,
        message:
          'Trend generation needs a text AI provider. Add an Anthropic (Claude) or Google (Gemini) API key in Settings → AI Providers.',
      };
    }

    const spec = getPlatformSpec(platform);
    const prompt = this.buildPrompt(spec.displayName, platform, count);

    let raw: string;
    let modelUsed: string;
    try {
      if (resolved.provider === 'claude') {
        const client = new Anthropic({ apiKey: resolved.apiKey });
        const res = await client.messages.create({
          model: resolved.model,
          max_tokens: 4096,
          temperature: 0.85,
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
            temperature: 0.85,
            maxOutputTokens: 4096,
          },
        });
        const res = await model.generateContent(prompt);
        raw = res.response.text();
        modelUsed = resolved.model;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Trend generation failed (${resolved.provider}): ${msg}`);
      return {
        ok: false,
        created: 0,
        modelUsed: resolved.model,
        message: `${resolved.provider === 'claude' ? 'Claude' : 'Gemini'} request failed: ${msg}`,
      };
    }

    const trends = this.parseTrends(raw);
    if (!trends.length) {
      return {
        ok: false,
        created: 0,
        modelUsed,
        message: 'AI returned no parsable trends. Try again or switch provider.',
      };
    }

    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.trend.createMany({
      data: trends.map((t) => ({
        workspaceId,
        platform,
        topic: t.topic.slice(0, 200),
        category: this.normalizeCategory(t.category),
        description: t.description.slice(0, 1000),
        velocity: t.velocity,
        // Tilt the initial freshness up for BREAKOUT, down for DECLINING
        freshnessScore: this.initialFreshness(t.velocity),
        estimatedReach: t.estimatedReach,
        suggestedAngles: t.suggestedAngles.slice(0, 5),
        hashtags: t.hashtags.slice(0, 8),
        exampleHandles: t.exampleHandles.slice(0, 5),
        expiresAt: sevenDaysFromNow,
        source: 'AI_GENERATED',
      })),
    });

    return { ok: true, created: trends.length, modelUsed };
  }

  /**
   * Refresh trends across all primary platforms in one go. Useful for the
   * "Refresh all" button in the UI — generates 5-7 per platform.
   */
  async refreshAll(workspaceId: string): Promise<{ ok: boolean; results: Array<{ platform: SocialPlatform; created: number }> }> {
    // Cover all 6 platforms now, not just IG/TT/RN — users want breadth.
    const platforms: SocialPlatform[] = [
      'INSTAGRAM', 'TIKTOK', 'REDNOTE', 'YOUTUBE', 'LINKEDIN', 'FACEBOOK',
    ];
    const results = await Promise.all(
      platforms.map(async (p) => {
        const r = await this.generate(workspaceId, p, 10);
        return { platform: p, created: r.created };
      }),
    );
    return { ok: results.some((r) => r.created > 0), results };
  }

  /**
   * Return a Composer-ready prompt + metadata for "Use in Composer" deep link.
   * The web app reads this to prefill the Composer with topic/angles/hashtags.
   */
  async getComposerPrompt(id: string, workspaceId: string): Promise<{
    platform: SocialPlatform;
    prompt: string;
    hashtags: string[];
  }> {
    const trend = await this.getById(id, workspaceId);
    const anglesBlock = trend.suggestedAngles.length
      ? `\n\nKey angles to consider:\n${trend.suggestedAngles.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}`
      : '';
    return {
      platform: trend.platform,
      prompt: `Write a ${trend.platform.toLowerCase()} post about: ${trend.topic}\n\n${trend.description}${anglesBlock}`,
      hashtags: trend.hashtags,
    };
  }

  // ----------------------------------------------------------------
  // Prompt + parsing
  // ----------------------------------------------------------------

  private buildPrompt(platformName: string, platform: SocialPlatform, count: number): string {
    return `You are a social media trend forecaster covering ${platformName} for an SMB brand.

Generate ${count} CURRENT trending topics, formats, or hashtag movements that a brand could create content around RIGHT NOW. Mix breakout trends, sustained themes, and emerging niches. Be specific — not generic.

For each trend, return:
- topic: short specific name (e.g. "5-day no-sugar challenge" not "health")
- category: one of: fitness, lifestyle, tech, beauty, food, finance, education, fashion, travel, business, entertainment, wellness
- description: 1-2 sentences explaining what's trending and why now
- velocity: one of BREAKOUT (just exploding), RISING (steady growth), SUSTAINED (long-running, still hot), DECLINING (past peak)
- estimatedReach: a hypothetical 30-day reach if a mid-tier brand posted today (integer between 5000 and 500000)
- suggestedAngles: 3-5 specific angles a brand could take on this trend
- hashtags: 4-8 relevant hashtags (without the # symbol)
- exampleHandles: 2-4 example creator/brand handles already winning on this trend (without @ symbol; can be approximate)

Be REALISTIC about the platform — ${platformName} content patterns differ:
${this.platformGuidance(platform)}

Return STRICT JSON only, no markdown fences:
{
  "trends": [
    {
      "topic": "...",
      "category": "...",
      "description": "...",
      "velocity": "BREAKOUT" | "RISING" | "SUSTAINED" | "DECLINING",
      "estimatedReach": 50000,
      "suggestedAngles": ["...", "...", "..."],
      "hashtags": ["...", "..."],
      "exampleHandles": ["...", "..."]
    }
  ]
}`;
  }

  private platformGuidance(platform: SocialPlatform): string {
    switch (platform) {
      case 'INSTAGRAM':
        return 'Reels-first, aesthetic photos, carousels for educational. UGC and BTS perform well. DM-shareable formats win.';
      case 'TIKTOK':
        return 'Trend remixes with trending audio, fast-paced edits, niche micro-communities, "POV" formats.';
      case 'REDNOTE':
        return 'Long-form educational posts, before/after, "must-buy lists" (必买清单), authentic reviews. CES scoring rewards comments + shares.';
      case 'YOUTUBE':
        return 'Long-form tutorials, listicles, story-driven content. Shorts for hooks. Search-friendly titles.';
      case 'LINKEDIN':
        return 'Thought leadership, case studies, hiring announcements, founder stories. Comments drive reach.';
      case 'FACEBOOK':
        return 'Community group content, live demos, longer-form storytelling, family-oriented angles.';
      default:
        return 'Optimize for the platform\'s primary engagement signals.';
    }
  }

  private parseTrends(raw: string): AiTrend[] {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed?.trends)) return [];
      return parsed.trends.filter((t: AiTrend) => this.isValidTrend(t));
    } catch {
      return [];
    }
  }

  private isValidTrend(t: AiTrend): boolean {
    return (
      typeof t.topic === 'string' &&
      t.topic.length > 0 &&
      typeof t.category === 'string' &&
      typeof t.description === 'string' &&
      ['BREAKOUT', 'RISING', 'SUSTAINED', 'DECLINING'].includes(t.velocity) &&
      Array.isArray(t.suggestedAngles) &&
      Array.isArray(t.hashtags)
    );
  }

  private normalizeCategory(input: string): string {
    const c = input.toLowerCase().trim();
    const known = [
      'fitness', 'lifestyle', 'tech', 'beauty', 'food', 'finance', 'education',
      'fashion', 'travel', 'business', 'entertainment', 'wellness',
    ];
    return known.includes(c) ? c : 'lifestyle';
  }

  private initialFreshness(velocity: 'BREAKOUT' | 'RISING' | 'SUSTAINED' | 'DECLINING'): number {
    switch (velocity) {
      case 'BREAKOUT':  return 100;
      case 'RISING':    return 90;
      case 'SUSTAINED': return 70;
      case 'DECLINING': return 50;
    }
  }
}
