import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';
import { PostPublisherService, MAX_RETRIES } from './post-publisher.service';

/**
 * In-process scheduler — no Redis. Every minute: claim due SCHEDULED posts
 * (atomic status flip so overlapping scans can't double-fire) and publish them.
 * Every 5 min: retry posts with failed platforms whose nextRetryAt has passed.
 * Same pattern as VideoGenerationService.reapStaleJobs.
 */
@Injectable()
export class PostScheduleCron {
  private readonly logger = new Logger(PostScheduleCron.name);

  constructor(private prisma: PrismaService, private publisher: PostPublisherService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runDuePosts(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.post.findMany({
      where: { status: PostStatus.SCHEDULED, scheduledFor: { lte: now } },
      select: { id: true }, take: 50,
    });
    for (const { id } of due) {
      const claim = await this.prisma.post.updateMany({
        where: { id, status: PostStatus.SCHEDULED },
        data: { status: PostStatus.PUBLISHING },
      });
      if (claim.count !== 1) continue;
      try { await this.publisher.publishPost(id); }
      catch (e) { this.logger.error(`publish ${id} failed: ${(e as Error).message}`); }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailed(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.post.findMany({
      where: {
        status: { in: [PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED] },
        variants: { some: { publications: { some: {
          status: PublicationStatus.FAILED, nextRetryAt: { lte: now }, retryCount: { lt: MAX_RETRIES },
        } } } },
      },
      select: { id: true }, take: 25,
    });
    for (const { id } of candidates) {
      const claim = await this.prisma.post.updateMany({
        where: { id, status: { in: [PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED] } },
        data: { status: PostStatus.PUBLISHING },
      });
      if (claim.count !== 1) continue;
      try { await this.publisher.publishPost(id); }
      catch (e) { this.logger.error(`retry ${id} failed: ${(e as Error).message}`); }
    }
  }
}
