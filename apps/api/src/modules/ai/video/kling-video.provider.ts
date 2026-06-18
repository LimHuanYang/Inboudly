import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const KLING_BASE = 'https://api-singapore.klingai.com';

// Map our model name → Kling's model_name string. Kling has its own
// versioning — adjust when their docs update.
const MODEL_ALIAS: Record<string, string> = {
  'kling-v1':     'kling-v1',
  'kling-v1-5':   'kling-v1-5',
  'kling-v1-6':   'kling-v1-6',
  'kling-v2':     'kling-v2-master',
};

/**
 * Kling video adapter. Direct against Kuaishou's Kling API (Singapore).
 *
 * Kling uses JWT-bearer auth: the stored credential is "access_key:secret_key",
 * which we split and use to sign a short-lived HS256 token per request.
 * The user pastes both keys in one input as `accessKey:secretKey`.
 */
@Injectable()
export class KlingVideoProvider implements VideoProvider {
  readonly name = 'kling';
  private readonly logger = new Logger(KlingVideoProvider.name);

  constructor(
    private media: MediaService,
    private r2: R2StorageService,
  ) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!apiKey) {
      throw new BadRequestException(
        'Kling credentials not configured. Go to Settings → AI Providers and add Kling.',
      );
    }
    const parts = apiKey.split(':');
    if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
      throw new BadRequestException(
        'Kling credentials must be in the format "access_key:secret_key". Update the key in Settings → AI Providers.',
      );
    }
    const [accessKey, secretKey] = parts;
    const jwt = this.signJwt(accessKey.trim(), secretKey.trim());

    const model = params.model.trim();
    const klingModel = MODEL_ALIAS[model] ?? model;
    const isImage2Video = !!params.referenceImageUrl;
    const path = isImage2Video ? '/v1/videos/image2video' : '/v1/videos/text2video';

    const body: Record<string, unknown> = {
      model_name: klingModel,
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      duration: String(this.clampDuration(params.durationSec)),
      mode: 'std', // 'std' (standard) | 'pro' (higher quality, costs more)
    };
    if (isImage2Video) body.image = params.referenceImageUrl;

    const submitRes = await fetch(`${KLING_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!submitRes.ok) {
      const detail = await submitRes.text().catch(() => submitRes.statusText);
      throw new Error(`Kling submit ${submitRes.status}: ${detail.slice(0, 200)}`);
    }
    const submission = (await submitRes.json()) as {
      code?: number;
      message?: string;
      data?: { task_id?: string };
    };
    if (submission.code !== 0 || !submission.data?.task_id) {
      throw new Error(`Kling did not return a task_id: ${submission.message ?? JSON.stringify(submission)}`);
    }

    const videoUrl = await this.pollUntilDone(path, submission.data.task_id, accessKey.trim(), secretKey.trim());

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Kling result download ${videoRes.status}: ${videoRes.statusText}`);
    }
    const buf = Buffer.from(await videoRes.arrayBuffer());
    const r2Url = await this.r2.putObject(
      `videos/kling/${randomUUID()}.mp4`,
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

    this.logger.log(`Kling/${model} generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model };
  }

  private async pollUntilDone(
    submitPath: string,
    taskId: string,
    accessKey: string,
    secretKey: string,
  ): Promise<string> {
    const statusPath = `${submitPath}/${taskId}`;
    const maxAttempts = 120; // ~10 min
    for (let i = 0; i < maxAttempts; i++) {
      // JWT must be re-signed for each call (short-lived).
      const jwt = this.signJwt(accessKey, secretKey);
      const res = await fetch(`${KLING_BASE}${statusPath}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Kling status ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        code?: number;
        message?: string;
        data?: {
          task_status?: string;
          task_status_msg?: string;
          task_result?: { videos?: Array<{ url?: string }> };
        };
      };
      const taskStatus = data.data?.task_status;
      if (taskStatus === 'succeed') {
        const url = data.data?.task_result?.videos?.[0]?.url;
        if (!url) throw new Error('Kling succeeded but no video URL in response');
        return url;
      }
      if (taskStatus === 'failed') {
        throw new Error(`Kling generation failed: ${data.data?.task_status_msg ?? 'unknown'}`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('Kling generation timed out after 10 minutes');
  }

  /** Sign a short-lived JWT (HS256) as Kling expects. Token is valid 30 min. */
  private signJwt(accessKey: string, secretKey: string): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
    const enc = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signingInput = `${enc(header)}.${enc(payload)}`;
    const sig = createHmac('sha256', secretKey).update(signingInput).digest('base64url');
    return `${signingInput}.${sig}`;
  }

  private clampDuration(requested: number): 5 | 10 {
    // Kling currently supports 5s and 10s clips.
    return requested >= 8 ? 10 : 5;
  }
}
