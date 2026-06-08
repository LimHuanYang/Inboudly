import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('analytics-pull') private readonly pullQueue: Queue,
  ) {}

  async overview(workspaceId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [postsCount, publishedCount, scheduledCount] = await Promise.all([
      this.prisma.post.count({ where: { workspaceId, createdAt: { gte: since } } }),
      this.prisma.post.count({
        where: { workspaceId, status: 'PUBLISHED', publishedAt: { gte: since } },
      }),
      this.prisma.post.count({ where: { workspaceId, status: 'SCHEDULED' } }),
    ]);

    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId },
      include: {
        analyticsSnapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
    });

    const totalFollowers = accounts.reduce(
      (sum, a) => sum + (a.analyticsSnapshots[0]?.followerCount ?? 0),
      0,
    );

    return {
      postsCount,
      publishedCount,
      scheduledCount,
      totalFollowers,
      accounts: accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        handle: a.handle,
        followerCount: a.analyticsSnapshots[0]?.followerCount ?? null,
        engagementRate: a.analyticsSnapshots[0]?.engagementRate ?? null,
        lastSyncedAt: a.lastSyncedAt,
      })),
    };
  }

  /**
   * Returns the latest PublicationMetrics row per publication for the
   * workspace, joined to the post/variant for display context.
   */
  async postMetrics(workspaceId: string) {
    // Fetch all SUCCESS publications for the workspace with their metrics
    const publications = await this.prisma.postPublication.findMany({
      where: {
        status: 'SUCCESS',
        postVariant: { post: { workspaceId } },
      },
      include: {
        socialAccount: true,
        postVariant: { include: { post: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    const results = [];

    for (const pub of publications) {
      // Grab the most-recent metrics snapshot for this publication
      const latest = await this.prisma.publicationMetrics.findFirst({
        where: { publicationId: pub.id },
        orderBy: { capturedAt: 'desc' },
      });

      results.push({
        publicationId: pub.id,
        platform: pub.socialAccount.platform,
        caption: pub.postVariant.caption,
        platformPostUrl: pub.platformPostUrl ?? null,
        likes: latest?.likes ?? null,
        comments: latest?.comments ?? null,
        shares: latest?.shares ?? null,
        impressions: latest?.impressions ?? null,
        videoViews: latest?.videoViews ?? null,
        capturedAt: latest?.capturedAt ?? null,
      });
    }

    return results;
  }

  /**
   * Returns daily summed engagement for the workspace over the last `days`
   * days, suitable for a line chart.
   */
  async engagementTimeseries(workspaceId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    // Collect all publication ids for the workspace
    const publications = await this.prisma.postPublication.findMany({
      where: {
        status: 'SUCCESS',
        postVariant: { post: { workspaceId } },
      },
      select: { id: true },
    });

    if (publications.length === 0) return [];

    const pubIds = publications.map((p) => p.id);

    // Pull all metric rows in the window
    const rows = await this.prisma.publicationMetrics.findMany({
      where: {
        publicationId: { in: pubIds },
        capturedAt: { gte: since },
      },
      orderBy: { capturedAt: 'asc' },
    });

    // Group by ISO date string (YYYY-MM-DD)
    const byDay = new Map<
      string,
      { likes: number; comments: number; impressions: number; videoViews: number }
    >();

    for (const row of rows) {
      const day = row.capturedAt.toISOString().slice(0, 10);
      const existing = byDay.get(day) ?? {
        likes: 0,
        comments: 0,
        impressions: 0,
        videoViews: 0,
      };
      byDay.set(day, {
        likes: existing.likes + (row.likes ?? 0),
        comments: existing.comments + (row.comments ?? 0),
        impressions: existing.impressions + (row.impressions ?? 0),
        videoViews: existing.videoViews + (row.videoViews ?? 0),
      });
    }

    return Array.from(byDay.entries()).map(([date, totals]) => ({
      date,
      ...totals,
    }));
  }

  /** Enqueue an analytics-pull job for the workspace. */
  async enqueueRefresh(workspaceId: string) {
    await this.pullQueue.add('pull', { workspaceId });
  }
}
