import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const RUNWAY_BASE = 'https://api.dev.runwayml.com';
const RUNWAY_API_VERSION = '2024-11-06';

// Runway Gen-3 / Gen-4 are image-to-video. The user must attach a reference
// image — there's no Runway endpoint for text-to-video at writing time.
const MODEL_ALIAS: Record<string, string> = {
  'runway-gen3':  'gen3a_turbo',
  'runway-gen4':  'gen4_turbo',
};

/**
 * Runway video adapter. Direct against api.dev.runwayml.com.
 *
 * Auth: `Authorization: Bearer <runwayKey>` + `X-Runway-Version: 2024-11-06`.
 * Endpoints may shift while the API matures — adjust if a call 404s.
 */
@Injectable()
export class RunwayVideoProvider implements VideoProvider {
  readonly name = 'runway';
  private readonly logger = new Logger(RunwayVideoProvider.name);

  constructor(
    private media: MediaService,
    private r2: R2StorageService,
  ) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!apiKey) {
      throw new BadRequestException(
        'Runway API key not configured. Go to Settings → AI Providers and add a Runway key.',
      );
    }
    if (!params.referenceImageUrl) {
      throw new BadRequestException(
        'Runway needs a reference image. Upload one in the Composer or pick a text-to-video model (Kling / Veo).',
      );
    }

    const model = params.model.trim();
    const runwayModel = MODEL_ALIAS[model] ?? model;
    const ratio = this.ratioForAspect(params.aspectRatio);

    const submitRes = await fetch(`${RUNWAY_BASE}/v1/image_to_video`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': RUNWAY_API_VERSION,
      },
      body: JSON.stringify({
        model: runwayModel,
        promptImage: params.referenceImageUrl,
        promptText: params.prompt,
        ratio,
        duration: this.clampDuration(params.durationSec),
      }),
    });
    if (!submitRes.ok) {
      const detail = await submitRes.text().catch(() => submitRes.statusText);
      throw new Error(`Runway submit ${submitRes.status}: ${detail.slice(0, 200)}`);
    }
    const submission = (await submitRes.json()) as { id?: string };
    if (!submission.id) throw new Error('Runway did not return a task id');

    const videoUrl = await this.pollUntilDone(submission.id, apiKey);

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Runway result download ${videoRes.status}: ${videoRes.statusText}`);
    }
    const buf = Buffer.from(await videoRes.arrayBuffer());
    const r2Url = await this.r2.putObject(
      `videos/runway/${randomUUID()}.mp4`,
      buf,
      'video/mp4',
    );

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: r2Url,
      filename: `${model}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: buf.length,
      durationSec: params.durationSec,
      aiPrompt: params.prompt,
      aiModel: model,
    });

    this.logger.log(`Runway/${model} generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model };
  }

  private async pollUntilDone(taskId: string, apiKey: string): Promise<string> {
    const maxAttempts = 120; // ~10 min at 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(`${RUNWAY_BASE}/v1/tasks/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Runway-Version': RUNWAY_API_VERSION,
        },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Runway status ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        status?: string;
        output?: string[];
        failure?: string;
      };

      if (data.status === 'SUCCEEDED') {
        const url = data.output?.[0];
        if (!url) throw new Error('Runway succeeded but no output URL in response');
        return url;
      }
      if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        throw new Error(`Runway generation failed: ${data.failure ?? data.status}`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('Runway generation timed out after 10 minutes');
  }

  private ratioForAspect(aspect: string): string {
    // Runway accepts a few fixed ratios; map ours to its supported set.
    if (aspect === '9:16') return '768:1280';
    if (aspect === '16:9') return '1280:768';
    return '960:960';
  }

  private clampDuration(requested: number): 5 | 10 {
    // Runway Gen-3 currently supports 5s and 10s. Snap to nearest.
    return requested >= 8 ? 10 : 5;
  }
}
