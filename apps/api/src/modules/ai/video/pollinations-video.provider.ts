import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const BASE_URL = 'https://gen.pollinations.ai/video';

/** Models that only accept a fixed set of durations (seconds). */
const FIXED_DURATIONS: Record<string, number[]> = { veo: [4, 6, 8] };

@Injectable()
export class PollinationsVideoProvider implements VideoProvider {
  readonly name = 'pollinations';
  private readonly logger = new Logger(PollinationsVideoProvider.name);

  constructor(
    private media: MediaService,
    private r2: R2StorageService,
  ) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    const model = params.model?.trim() || 'seedance';
    const duration = this.clampDuration(model, params.durationSec);

    const qs = new URLSearchParams({ model, duration: String(duration) });
    if (params.aspectRatio === '9:16' || params.aspectRatio === '16:9') {
      qs.set('aspectRatio', params.aspectRatio);
    } else {
      qs.set('width', '1024');
      qs.set('height', '1024');
    }
    if (params.referenceImageUrl) {
      qs.set('image', params.referenceImageUrl);
    }

    const url = `${BASE_URL}/${encodeURIComponent(params.prompt)}?${qs.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Pollinations video ${res.status}: ${String(detail).slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const r2Url = await this.r2.putObject(
      `videos/pollinations/${randomUUID()}.mp4`,
      buf,
      'video/mp4',
    );

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: r2Url,
      filename: `pollinations-${model}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: buf.length,
      durationSec: duration,
      aiPrompt: params.prompt,
      aiModel: model,
    });

    this.logger.log(`Pollinations video generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model };
  }

  private clampDuration(model: string, requested: number): number {
    const allowed = FIXED_DURATIONS[model];
    if (!allowed || allowed.length === 0) return requested;
    return allowed.reduce<number>(
      (best, n) => (Math.abs(n - requested) < Math.abs(best - requested) ? n : best),
      allowed[0] as number,
    );
  }
}
