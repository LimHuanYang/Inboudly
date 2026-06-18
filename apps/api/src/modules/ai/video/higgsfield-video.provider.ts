import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const HF_BASE = 'https://platform.higgsfield.ai';
// Higgsfield's image-to-video model id. Other ids exist on the platform
// (e.g. 'kling-video/v2.1/pro/image-to-video'); confirm model id + request
// body fields against https://docs.higgsfield.ai/docs before first live run.
const HF_MODEL = 'higgsfield-ai/dop/standard';

/**
 * Higgsfield cinematic video via Higgsfield's OWN platform API
 * (platform.higgsfield.ai) — direct, not via an aggregator. BYOK: the stored
 * key is "api_key:api_key_secret" and goes verbatim into the Authorization
 * header (`Key key:secret`). Higgsfield image-to-video is image-driven — a
 * reference image is required.
 */
@Injectable()
export class HiggsfieldVideoProvider implements VideoProvider {
  readonly name = 'higgsfield';
  private readonly logger = new Logger(HiggsfieldVideoProvider.name);

  constructor(private media: MediaService, private r2: R2StorageService) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!apiKey || !apiKey.includes(':')) {
      throw new BadRequestException(
        'Higgsfield key not configured. Add it as "api_key:api_key_secret" in Settings → AI Providers (from cloud.higgsfield.ai).',
      );
    }
    if (!params.referenceImageUrl) {
      throw new BadRequestException(
        'Higgsfield video is image-driven — generate or attach a reference image first, then animate it.',
      );
    }
    const auth = `Key ${apiKey}`;

    const submit = await fetch(`${HF_BASE}/${HF_MODEL}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: params.referenceImageUrl,
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
      }),
    });
    if (!submit.ok) {
      const detail = await submit.text().catch(() => submit.statusText);
      throw new Error(`Higgsfield submit ${submit.status}: ${detail.slice(0, 200)}`);
    }
    const submission = (await submit.json()) as { request_id?: string; status_url?: string };
    const requestId = submission.request_id;
    if (!requestId) throw new Error('Higgsfield did not return a request_id');

    const videoUrl = await this.poll(requestId, auth);

    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Higgsfield result download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const r2Url = await this.r2.putObject(`videos/higgsfield/${randomUUID()}.mp4`, buf, 'video/mp4');

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: r2Url,
      filename: 'higgsfield.mp4',
      mimeType: 'video/mp4',
      sizeBytes: buf.length,
      durationSec: params.durationSec,
      aiPrompt: params.prompt,
      aiModel: HF_MODEL,
    });
    this.logger.log(`Higgsfield video for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model: 'higgsfield' };
  }

  private async poll(requestId: string, auth: string): Promise<string> {
    for (let i = 0; i < 120; i++) { // ~10 min @ 5s
      const r = await fetch(`${HF_BASE}/requests/${requestId}/status`, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error(`Higgsfield status ${r.status}`);
      const d = (await r.json()) as { status?: string; results?: { url?: string }[]; url?: string };
      if (d.status === 'completed') {
        const url = d.results?.[0]?.url ?? d.url;
        if (!url) throw new Error('Higgsfield completed but no media URL');
        return url;
      }
      if (d.status === 'failed' || d.status === 'nsfw') throw new Error(`Higgsfield generation ${d.status}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
    throw new Error('Higgsfield generation timed out after 10 minutes');
  }
}
