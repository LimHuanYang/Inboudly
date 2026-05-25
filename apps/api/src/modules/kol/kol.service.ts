import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, type SocialPlatform } from '@inboudly/database';

export interface KolSearchFilters {
  platform?: SocialPlatform;
  niches?: string[];           // any-of match against the KOL's niche array
  language?: string;           // e.g. 'zh-CN', 'en'
  country?: string;            // ISO-3166-1 alpha-2 (e.g. 'CN', 'US')
  minFollowers?: number;
  maxFollowers?: number;
  minEngagementRate?: number;  // 0..1 — 0.05 = 5% ER
  minAuthenticityScore?: number; // 0..100
  searchQuery?: string;        // matches handle / displayName / bio
  sortBy?: 'followers' | 'engagement' | 'authenticity' | 'recent';
  limit?: number;
  cursor?: string;             // for pagination
}

/**
 * Core KOL repository. CRUD + filterable search.
 *
 * KOLs are platform-scoped resources, not workspace-scoped — every workspace
 * sees the same KOL pool (search is the value). Workspace-specific data lives
 * on KolCampaign / KolDeliverable (linked separately).
 */
@Injectable()
export class KolService {
  constructor(private prisma: PrismaService) {}

  async search(filters: KolSearchFilters) {
    const limit = Math.min(filters.limit ?? 24, 100);

    const where: Prisma.KolWhereInput = {
      ...(filters.platform && { platform: filters.platform }),
      ...(filters.language && { language: filters.language }),
      ...(filters.country && { country: filters.country }),
      ...(filters.minFollowers !== undefined && { followerCount: { gte: filters.minFollowers } }),
      ...(filters.maxFollowers !== undefined && {
        followerCount: {
          ...(filters.minFollowers !== undefined ? { gte: filters.minFollowers } : {}),
          lte: filters.maxFollowers,
        },
      }),
      ...(filters.minEngagementRate !== undefined && {
        engagementRate: { gte: filters.minEngagementRate },
      }),
      ...(filters.minAuthenticityScore !== undefined && {
        authenticityScore: { gte: filters.minAuthenticityScore },
      }),
      // niche is a string[] in Postgres — `hasSome` matches if ANY filter niche is in the row
      ...(filters.niches?.length && { niche: { hasSome: filters.niches } }),
      // free-text search across handle / displayName / bio / niche tags
      ...(filters.searchQuery && {
        OR: [
          { handle:      { contains: filters.searchQuery, mode: 'insensitive' } },
          { displayName: { contains: filters.searchQuery, mode: 'insensitive' } },
          { bio:         { contains: filters.searchQuery, mode: 'insensitive' } },
          // Postgres array contains-element: matches if any niche tag equals
          // the search query (lowercased) or contains it as a substring.
          { niche:       { has: filters.searchQuery.toLowerCase() } },
        ],
      }),
    };

    const orderBy: Prisma.KolOrderByWithRelationInput =
      filters.sortBy === 'followers'    ? { followerCount: 'desc' }    :
      filters.sortBy === 'engagement'   ? { engagementRate: 'desc' }   :
      filters.sortBy === 'authenticity' ? { authenticityScore: 'desc' } :
      { createdAt: 'desc' };

    const rows = await this.prisma.kol.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return { items, nextCursor, hasMore };
  }

  async getById(id: string) {
    const kol = await this.prisma.kol.findUnique({
      where: { id },
      include: {
        campaignDeliverables: {
          include: { campaign: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!kol) throw new NotFoundException('KOL not found');
    return kol;
  }

  /** Distinct niches across all KOLs — for populating filter UI dropdown. */
  async listNiches(platform?: SocialPlatform): Promise<string[]> {
    const rows = await this.prisma.kol.findMany({
      where: platform ? { platform } : undefined,
      select: { niche: true },
      take: 1000,
    });
    const set = new Set<string>();
    for (const r of rows) for (const n of r.niche) set.add(n);
    return Array.from(set).sort();
  }

  /** Used by the analysis service to write scoring results back. */
  async updateScores(
    id: string,
    scores: {
      authenticityScore?: number;
      bot24x7Score?: number;
      commentLanguageScore?: number;
      audienceOverlap?: Record<string, unknown>;
    },
  ) {
    return this.prisma.kol.update({
      where: { id },
      data: {
        ...(scores.authenticityScore !== undefined && { authenticityScore: scores.authenticityScore }),
        ...(scores.bot24x7Score !== undefined && { bot24x7Score: scores.bot24x7Score }),
        ...(scores.commentLanguageScore !== undefined && {
          commentLanguageScore: scores.commentLanguageScore,
        }),
        ...(scores.audienceOverlap !== undefined && { audienceOverlap: scores.audienceOverlap as never }),
        lastAnalyzedAt: new Date(),
      },
    });
  }
}
