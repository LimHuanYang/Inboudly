import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConnectorRegistry } from '../connectors/connector-registry.service';

interface AnalyticsPullPayload {
  workspaceId: string;
}

@Processor('analytics-pull')
export class AnalyticsPullProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsPullProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
  ) {
    super();
  }

  async process(job: Job<AnalyticsPullPayload>): Promise<void> {
    const { workspaceId } = job.data;
    this.logger.log(`Analytics pull started for workspace ${workspaceId}`);

    // Load all SUCCESS publications for the workspace with a platformPostId,
    // joining postVariant → post (for workspaceId filter) + socialAccount.
    const publications = await this.prisma.postPublication.findMany({
      where: {
        status: 'SUCCESS',
        platformPostId: { not: null },
        postVariant: {
          post: { workspaceId },
        },
      },
      include: {
        socialAccount: true,
        postVariant: { include: { post: true } },
      },
    });

    this.logger.log(
      `Found ${publications.length} publication(s) to pull metrics for`,
    );

    for (const pub of publications) {
      const { platformPostId, socialAccount: account } = pub;
      if (!platformPostId) continue; // type-guard (already filtered above)

      try {
        const connector = this.registry.get(account.platform);
        if (typeof connector.getPostMetrics !== 'function') {
          continue; // connector does not support metrics — skip silently
        }

        const metrics = await connector.getPostMetrics(account, platformPostId);

        await this.prisma.publicationMetrics.create({
          data: {
            publicationId: pub.id,
            capturedAt: new Date(),
            likes: metrics.likes ?? null,
            comments: metrics.comments ?? null,
            shares: metrics.shares ?? null,
            saves: metrics.saves ?? null,
            reach: metrics.reach ?? null,
            impressions: metrics.impressions ?? null,
            videoViews: metrics.videoViews ?? null,
            extra: metrics.extra !== undefined ? (metrics.extra as object) : undefined,
          },
        });

        this.logger.debug(`Metrics captured for publication ${pub.id}`);
      } catch (err) {
        this.logger.warn(
          `Skipping publication ${pub.id}: ${(err as Error).message}`,
        );
        // per-publication errors do NOT abort the batch
      }
    }

    this.logger.log(`Analytics pull complete for workspace ${workspaceId}`);
  }
}
