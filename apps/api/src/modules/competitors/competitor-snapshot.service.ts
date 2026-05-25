import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Captures a point-in-time snapshot of a competitor's public metrics.
 *
 * Phase 2A.2 (now): mock-data generator for the demo seed competitors —
 *   simulates realistic week-over-week follower growth / ER drift so the
 *   timeline UI has interesting movement.
 * Phase 2A.2.1 (next sprint): real scrapers via:
 *   - instagrapi (IG)
 *   - davidteather/TikTok-Api (TT)
 *   - all-in-one-rednote-scraper (RN)
 *   Triggered by a daily BullMQ cron job. The mock generator stays as a
 *   fallback when scraping fails or returns no data.
 */
@Injectable()
export class CompetitorSnapshotService {
  private readonly logger = new Logger(CompetitorSnapshotService.name);

  constructor(private prisma: PrismaService) {}

  /** Capture one snapshot now. */
  async capture(competitorId: string) {
    const competitor = await this.prisma.competitor.findUnique({
      where: { id: competitorId },
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    });
    if (!competitor) throw new Error('Competitor not found');

    // For Phase 2A.2, we generate mock movement. Real scrapers land next sprint.
    const last = competitor.snapshots[0];
    const baseFollowers = last?.followerCount ?? this.seedFollowerCount(competitor.platform);
    const baseEr = last?.engagementRate ? Number(last.engagementRate) : 0.04;

    // Realistic week-over-week drift: ±2% on followers, ±15% on ER
    const followerDelta = Math.round(baseFollowers * (Math.random() * 0.04 - 0.02));
    const erDelta = baseEr * (Math.random() * 0.3 - 0.15);

    const followerCount = Math.max(0, baseFollowers + followerDelta);
    const engagementRate = Math.max(0.001, Math.min(0.2, baseEr + erDelta));
    const postCount = (last?.postCount ?? 80) + Math.floor(Math.random() * 5);

    return this.prisma.competitorSnapshot.create({
      data: {
        competitorId,
        followerCount,
        postCount,
        engagementRate,
        topPostsJson: this.mockTopPosts(competitor.platform),
        extra: {
          source: 'mock',
          note: 'Real scrapers (instagrapi/TikTok-Api/RedNote) wired in next sprint',
        },
      },
    });
  }

  /** Capture a snapshot for every competitor in a workspace. */
  async captureAllInWorkspace(workspaceId: string) {
    const competitors = await this.prisma.competitor.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    let captured = 0;
    for (const c of competitors) {
      try {
        await this.capture(c.id);
        captured++;
      } catch (err) {
        this.logger.warn(`Snapshot failed for ${c.id}: ${(err as Error).message}`);
      }
    }
    return { captured, total: competitors.length };
  }

  /** Backfill 30 days of mock snapshots so timeline has historical data. */
  async backfill30Days(competitorId: string) {
    const competitor = await this.prisma.competitor.findUnique({ where: { id: competitorId } });
    if (!competitor) throw new Error('Competitor not found');

    // Clear any existing snapshots for clean backfill
    await this.prisma.competitorSnapshot.deleteMany({ where: { competitorId } });

    let followers = this.seedFollowerCount(competitor.platform);
    let er = 0.03 + Math.random() * 0.06;
    let posts = 60 + Math.floor(Math.random() * 40);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    for (let i = 30; i >= 0; i--) {
      // Followers trend up gently with random daily noise
      const dailyGrowth = 0.001 + Math.random() * 0.004;
      followers = Math.round(followers * (1 + dailyGrowth));
      // ER slowly drifts
      er = Math.max(0.005, Math.min(0.15, er + (Math.random() * 0.004 - 0.002)));
      // Posts only grow on ~half the days
      if (Math.random() > 0.5) posts++;

      await this.prisma.competitorSnapshot.create({
        data: {
          competitorId,
          capturedAt: new Date(now - i * day),
          followerCount: followers,
          postCount: posts,
          engagementRate: er,
          topPostsJson: i === 0 ? this.mockTopPosts(competitor.platform) : undefined,
          extra: { source: 'mock-backfill' },
        },
      });
    }
    return { backfilled: 31 };
  }

  private seedFollowerCount(platform: string): number {
    // Per-platform realistic starting follower counts for medium-brand competitors
    const ranges: Record<string, [number, number]> = {
      INSTAGRAM: [80_000, 600_000],
      TIKTOK: [120_000, 900_000],
      REDNOTE: [60_000, 500_000],
      YOUTUBE: [30_000, 400_000],
      LINKEDIN: [10_000, 200_000],
    };
    const [min, max] = ranges[platform] ?? [50_000, 200_000];
    return Math.floor(min + Math.random() * (max - min));
  }

  private mockTopPosts(platform: string) {
    const ideas = {
      INSTAGRAM: [
        'New product launch carousel — 12.4k saves, 3.1k DM shares',
        'Behind-the-scenes Reel — 89k views, 7.2% completion',
        'UGC repost feature — 4.5k likes',
      ],
      TIKTOK: [
        '30-sec trend remix — 412k views, 18% completion',
        'Tutorial with trending audio — 87k views',
        '"Did you know" educational — 156k views',
      ],
      REDNOTE: [
        '"必买清单" (must-buy list) — 8.9k 收藏 (collections), CES 142',
        'Product review with before/after — 12k 点赞, 340 comments',
        'Q&A note responding to FAQ — 5.6k 收藏',
      ],
      YOUTUBE: [
        '"5 mistakes new buyers make" — 218k views',
        'Product unboxing — 92k views, 8min avg watch',
        'Trend reaction Short — 1.2M views',
      ],
    } as Record<string, string[]>;
    return { top3: ideas[platform] ?? [] };
  }
}
