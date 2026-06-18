import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiCredentialsService } from '../../ai-credentials/ai-credentials.service';
import { HiggsfieldVideoProvider } from './higgsfield-video.provider';
import type { VideoProvider } from './video-provider.interface';
import { VideoStatus } from '@inboudly/database';
import type { GenerateVideoInput } from '@inboudly/shared';

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
    private higgsfield: HiggsfieldVideoProvider,
  ) {}

  /** Map a resolved provider name to its adapter. Only Higgsfield today;
   *  the seam stays so a second provider is a new case, not a rewrite. */
  private adapterFor(_provider: string): VideoProvider {
    return this.higgsfield;
  }

  /**
   * Create a job, kick off the detached provider call, and return the row with
   * status GENERATING. The frontend polls GET /ai/video/:id until READY/FAILED.
   */
  async create(input: GenerateVideoInput) {
    const resolved = await this.credentials.resolveVideoProvider(input.workspaceId, input.provider);
    const model = input.model?.trim() || resolved.model;

    const job = await this.prisma.videoGeneration.create({
      data: {
        workspaceId: input.workspaceId,
        prompt: input.prompt,
        provider: resolved.provider,
        model,
        aspectRatio: input.aspectRatio,
        durationSec: input.durationSec,
        referenceImageUrl: input.referenceImageUrl ?? null,
        status: VideoStatus.GENERATING,
      },
    });

    // Detached — do NOT await. Failures are captured onto the job row in run().
    void this.run(job.id, resolved.apiKey);

    return job;
  }

  private async run(jobId: string, apiKey: string): Promise<void> {
    try {
      const job = await this.prisma.videoGeneration.findUnique({ where: { id: jobId } });
      if (!job) return;
      try {
        const adapter = this.adapterFor(job.provider);
        const result = await adapter.generate(apiKey, {
          workspaceId: job.workspaceId,
          prompt: job.prompt,
          durationSec: job.durationSec,
          aspectRatio: job.aspectRatio,
          model: job.model,
          referenceImageUrl: job.referenceImageUrl ?? undefined,
        });
        await this.prisma.videoGeneration.update({
          where: { id: jobId },
          data: { status: VideoStatus.READY, mediaAssetId: result.asset.id },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Video job ${jobId} failed: ${msg}`);
        await this.prisma.videoGeneration.update({
          where: { id: jobId },
          data: { status: VideoStatus.FAILED, errorMessage: this.failureMessage(job.provider, msg) },
        });
      }
    } catch (outerErr) {
      // findUnique, or the FAILED-branch update itself, threw. Swallow here so
      // the detached `void this.run(...)` never surfaces an unhandled rejection.
      const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
      this.logger.error(`Video job ${jobId} infrastructure error: ${msg}`);
    }
  }

  async get(id: string, workspaceId: string) {
    const job = await this.prisma.videoGeneration.findFirst({
      where: { id, workspaceId },
      // Select only {id,url}: the web needs nothing else, and it avoids
      // serializing MediaAsset.sizeBytes (Prisma BigInt) which JSON.stringify
      // cannot handle (would 500 the response).
      include: { mediaAsset: { select: { id: true, url: true } } },
    });
    if (!job) throw new NotFoundException('Video generation not found');
    return job;
  }

  list(workspaceId: string) {
    return this.prisma.videoGeneration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      // Select only {id,url}: the web needs nothing else, and it avoids
      // serializing MediaAsset.sizeBytes (Prisma BigInt) which JSON.stringify
      // cannot handle (would 500 the response).
      include: { mediaAsset: { select: { id: true, url: true } } },
    });
  }

  private static readonly STALE_MS = 10 * 60 * 1000;

  /** Safety net for the in-process runner: a server restart (or a hung provider)
   *  can orphan a GENERATING job. Fail anything stuck past STALE_MS. */
  @Cron('*/2 * * * *')
  async reapStaleJobs(): Promise<void> {
    const cutoff = new Date(Date.now() - VideoGenerationService.STALE_MS);
    const res = await this.prisma.videoGeneration.updateMany({
      where: { status: VideoStatus.GENERATING, updatedAt: { lt: cutoff } },
      data: { status: VideoStatus.FAILED, errorMessage: 'Generation timed out. Please try again.' },
    });
    if (res.count > 0) this.logger.warn(`Reaped ${res.count} stale video job(s)`);
  }

  private failureMessage(_provider: string, rawMsg: string): string {
    return `${rawMsg}. Check your Higgsfield key in Settings → AI Providers (format api_key:api_key_secret) and that your account has credit.`;
  }
}
