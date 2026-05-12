import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

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
}
