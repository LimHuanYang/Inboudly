import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus } from '@inboudly/database';

@Injectable()
export class SchedulerService {
  constructor(
    @InjectQueue('publish') private publishQueue: Queue,
    private prisma: PrismaService,
  ) {}

  /**
   * Enqueue a post for publishing at the given time.
   * BullMQ delays the job until scheduledFor.
   */
  async schedulePost(postId: string, scheduledFor: Date) {
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());

    const job = await this.publishQueue.add(
      'publish-post',
      { postId },
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    );

    await this.prisma.scheduledJob.create({
      data: {
        postId,
        jobType: 'publish',
        bullJobId: job.id,
        scheduledFor,
        payload: { postId },
      },
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.SCHEDULED, scheduledFor },
    });

    return { jobId: job.id };
  }

  async cancelScheduled(postId: string) {
    const jobs = await this.prisma.scheduledJob.findMany({
      where: { postId, status: 'QUEUED' },
    });
    for (const j of jobs) {
      if (j.bullJobId) {
        const job = await this.publishQueue.getJob(j.bullJobId);
        await job?.remove();
      }
      await this.prisma.scheduledJob.update({
        where: { id: j.id },
        data: { status: 'CANCELLED' },
      });
    }
  }
}
