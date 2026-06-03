import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiCredentialsService } from '../../ai-credentials/ai-credentials.service';
import { DemoVideoProvider } from './demo-video.provider';
import type { VideoProvider } from './video-provider.interface';
import { VideoStatus } from '@inboudly/database';
import type { GenerateVideoInput } from '@inboudly/shared';

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
    private demo: DemoVideoProvider,
  ) {}

  /** Map a resolved provider name to its adapter. Plans 2/3 add more cases. */
  private adapterFor(provider: string): VideoProvider {
    switch (provider) {
      case 'demo':
        return this.demo;
      default:
        // resolveVideoProvider only returns implemented providers today, so this
        // is defensive — fall back to the always-works Demo provider.
        this.logger.warn(`Unknown video provider "${provider}", falling back to demo`);
        return this.demo;
    }
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
          data: { status: VideoStatus.FAILED, errorMessage: this.friendlyError(job.provider) },
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
      include: { mediaAsset: true },
    });
    if (!job) throw new NotFoundException('Video generation not found');
    return job;
  }

  list(workspaceId: string) {
    return this.prisma.videoGeneration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { mediaAsset: true },
    });
  }

  private friendlyError(provider: string): string {
    if (provider === 'demo') {
      return 'The demo video generator hit an unexpected error. Please try again.';
    }
    return `${provider} video generation isn't available yet in this build. Switch to the Demo provider in Settings → AI defaults.`;
  }
}
