import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { MediaService } from '../../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

/** DI token for overriding the simulated latency (tests inject 0). */
export const DEMO_VIDEO_DELAY_MS = 'DEMO_VIDEO_DELAY_MS';

/** Bundled clip served by the web app from apps/web/public/demo/. */
const DEMO_CLIP_URL = '/demo/sample-clip.mp4';

/**
 * Always-works, zero-setup video provider. Waits a short delay (so the
 * GENERATING → READY UI flow is real), then registers a bundled sample clip as
 * an AI-generated VIDEO MediaAsset. No API key, no R2, no ffmpeg, no network.
 */
@Injectable()
export class DemoVideoProvider implements VideoProvider {
  readonly name = 'demo';
  private readonly logger = new Logger(DemoVideoProvider.name);

  constructor(
    private media: MediaService,
    @Optional() @Inject(DEMO_VIDEO_DELAY_MS) private readonly delayMs: number = 1200,
  ) {}

  async generate(_apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: DEMO_CLIP_URL,
      filename: 'demo-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 0, // bundled static asset — real byte size not tracked for the demo
      durationSec: params.durationSec,
      aiPrompt: params.prompt,
      aiModel: params.model || this.name,
    });

    this.logger.log(`Demo video generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model: 'demo' };
  }
}
