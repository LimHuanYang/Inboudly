import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';
import { ConnectorRegistry } from '../connectors/connector-registry.service';

interface PublishJobPayload {
  postId: string;
}

/**
 * BullMQ worker that publishes posts when their scheduled time arrives.
 *
 * Delegates the actual platform call to the connector registered for each
 * variant's platform. Connectors implement IPlatformConnector — see
 * modules/connectors/connector.interface.ts.
 */
@Processor('publish')
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(private prisma: PrismaService, private connectors: ConnectorRegistry) {
    super();
  }

  async process(job: Job<PublishJobPayload>): Promise<void> {
    const { postId } = job.data;
    this.logger.log(`Publishing post ${postId}`);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        variants: { include: { media: { include: { mediaAsset: true } } } },
        workspace: { include: { socialAccounts: true } },
      },
    });

    if (!post) {
      this.logger.warn(`Post ${postId} not found, skipping`);
      return;
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.PUBLISHING },
    });

    let allOk = true;

    for (const variant of post.variants) {
      const account = post.workspace.socialAccounts.find(
        (a) => a.platform === variant.platform && a.status === 'ACTIVE',
      );
      if (!account) {
        this.logger.warn(`No active ${variant.platform} account for post ${postId}`);
        allOk = false;
        continue;
      }

      try {
        const connector = this.connectors.get(variant.platform);
        const result = await connector.publish({
          account,
          variant: { ...variant, media: variant.media },
        });

        await this.prisma.postPublication.upsert({
          where: {
            postVariantId_socialAccountId: {
              postVariantId: variant.id,
              socialAccountId: account.id,
            },
          },
          update: {
            status: PublicationStatus.SUCCESS,
            platformPostId: result.platformPostId,
            platformPostUrl: result.platformPostUrl,
            publishedAt: new Date(),
            errorMessage: null,
          },
          create: {
            postVariantId: variant.id,
            socialAccountId: account.id,
            status: PublicationStatus.SUCCESS,
            platformPostId: result.platformPostId,
            platformPostUrl: result.platformPostUrl,
            publishedAt: new Date(),
          },
        });
      } catch (err) {
        allOk = false;
        this.logger.error(`Failed to publish ${variant.platform} variant`, err);
        await this.prisma.postPublication.upsert({
          where: {
            postVariantId_socialAccountId: {
              postVariantId: variant.id,
              socialAccountId: account.id,
            },
          },
          update: {
            status: PublicationStatus.FAILED,
            errorMessage: (err as Error).message,
            retryCount: { increment: 1 },
          },
          create: {
            postVariantId: variant.id,
            socialAccountId: account.id,
            status: PublicationStatus.FAILED,
            errorMessage: (err as Error).message,
          },
        });
      }
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        status: allOk ? PostStatus.PUBLISHED : PostStatus.FAILED,
        publishedAt: allOk ? new Date() : undefined,
      },
    });
  }
}
