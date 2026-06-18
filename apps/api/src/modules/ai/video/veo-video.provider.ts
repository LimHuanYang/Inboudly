import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Veo model versions exposed via the Gemini API. If Google hasn't shipped Veo
// on AI Studio for your account, the predict call returns a model_not_found
// and we surface a clear "request access" message.
const MODEL_ALIAS: Record<string, string> = {
  'veo-3':   'veo-3.0-generate-001',
  'veo-2':   'veo-2.0-generate-001',
};

/**
 * Google Veo video adapter via the Gemini API (not Vertex AI).
 *
 * Auth: same workspace Gemini API key (`?key=<key>`). The flow:
 *   1. predictLongRunning → returns operation name
 *   2. poll /v1beta/<operation_name> until done
 *   3. download the video URI (may need ?key=<key> appended)
 *
 * Veo via Gemini API is rolling out gradually. If Google hasn't enabled it on
 * the account, the predict call returns 404 / not_found and we surface a
 * helpful "request access" message.
 */
@Injectable()
export class VeoVideoProvider implements VideoProvider {
  readonly name = 'veo';
  private readonly logger = new Logger(VeoVideoProvider.name);

  constructor(
    private media: MediaService,
    private r2: R2StorageService,
  ) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!apiKey) {
      throw new BadRequestException(
        'Google (Gemini) API key not configured. Veo runs on the Gemini API key. Add one in Settings → AI Providers.',
      );
    }

    const model = params.model.trim();
    const veoModel = MODEL_ALIAS[model] ?? model;

    const body: Record<string, unknown> = {
      instances: [
        {
          prompt: params.prompt,
          ...(params.referenceImageUrl ? { image: { uri: params.referenceImageUrl } } : {}),
        },
      ],
      parameters: {
        aspectRatio: params.aspectRatio,
        durationSeconds: this.clampDuration(params.durationSec),
      },
    };

    const submitRes = await fetch(
      `${GEMINI_BASE}/v1beta/models/${encodeURIComponent(veoModel)}:predictLongRunning?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!submitRes.ok) {
      const detail = await submitRes.text().catch(() => submitRes.statusText);
      if (submitRes.status === 404 || submitRes.status === 403) {
        throw new Error(
          `Veo isn't enabled on this Gemini key (HTTP ${submitRes.status}). Google rolls Veo out per account — request access at aistudio.google.com.`,
        );
      }
      throw new Error(`Veo submit ${submitRes.status}: ${detail.slice(0, 200)}`);
    }
    const op = (await submitRes.json()) as { name?: string };
    if (!op.name) throw new Error('Veo did not return an operation name');

    const videoUri = await this.pollUntilDone(op.name, apiKey);

    const dlUrl = videoUri.includes('?') ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`;
    const videoRes = await fetch(dlUrl);
    if (!videoRes.ok) {
      throw new Error(`Veo result download ${videoRes.status}: ${videoRes.statusText}`);
    }
    const buf = Buffer.from(await videoRes.arrayBuffer());
    const r2Url = await this.r2.putObject(
      `videos/veo/${randomUUID()}.mp4`,
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

    this.logger.log(`Veo/${model} generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model };
  }

  private async pollUntilDone(operationName: string, apiKey: string): Promise<string> {
    const maxAttempts = 120; // ~10 min
    for (let i = 0; i < maxAttempts; i++) {
      const res = await fetch(`${GEMINI_BASE}/v1beta/${operationName}?key=${apiKey}`);
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Veo status ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: {
          predictions?: Array<{
            video?: { uri?: string };
            videoUri?: string;
            uri?: string;
          }>;
        };
      };

      if (data.done) {
        if (data.error) {
          throw new Error(`Veo generation failed: ${data.error.message ?? 'unknown'}`);
        }
        const pred = data.response?.predictions?.[0];
        const uri = pred?.video?.uri ?? pred?.videoUri ?? pred?.uri;
        if (!uri) throw new Error('Veo completed but no video URI in response');
        return uri;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('Veo generation timed out after 10 minutes');
  }

  private clampDuration(requested: number): number {
    // Veo supports 4-8 seconds; clamp into that band.
    if (requested < 4) return 4;
    if (requested > 8) return 8;
    return requested;
  }
}
