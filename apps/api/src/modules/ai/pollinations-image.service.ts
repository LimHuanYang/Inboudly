import { Injectable, Logger } from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';

const DEFAULT_MODEL = 'flux';
const BASE_URL = 'https://image.pollinations.ai/prompt';
const DEFAULT_DIMS = { width: 1024, height: 1024 };

// Pollinations accepts arbitrary width/height — map our social aspect ratios
// to sensible pixel sizes.
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1':    { width: 1024, height: 1024 },
  '4:5':    { width: 1024, height: 1280 },
  '9:16':   { width: 1024, height: 1820 },
  '16:9':   { width: 1820, height: 1024 },
  '3:4':    { width: 1024, height: 1365 },
  '2:3':    { width: 1024, height: 1536 },
  '1.91:1': { width: 1820, height: 953 },
};

/**
 * Pollinations.ai — FREE image generation, no API key or signup. We GET
 *   https://image.pollinations.ai/prompt/{prompt}?width=&height=&model=
 * which returns the raw image bytes directly. Used as the zero-cost default so
 * a workspace can generate images before adding any paid provider key.
 */
@Injectable()
export class PollinationsImageService {
  private readonly logger = new Logger(PollinationsImageService.name);

  constructor(private media: MediaService) {}

  async generate(
    _apiKey: string, // Pollinations is keyless — kept for resolver signature parity.
    params: {
      workspaceId: string;
      prompt: string;
      aspectRatio?: string;
      count?: number;
      model?: string;
      brandKit?: {
        primaryColor?: string | null;
        secondaryColor?: string | null;
        fontFamily?: string | null;
      };
    },
  ) {
    const model = params.model?.trim() || DEFAULT_MODEL;
    const count = params.count ?? 1;
    const dims = DIMENSIONS[params.aspectRatio ?? '1:1'] ?? DEFAULT_DIMS;
    const enrichedPrompt = this.enrichPromptWithBrand(params.prompt, params.brandKit);

    const assets = [];
    for (let i = 0; i < count; i++) {
      // Vary the seed so a batch returns distinct images, not the same one.
      const seed = Date.now() + i;
      const url =
        `${BASE_URL}/${encodeURIComponent(enrichedPrompt)}` +
        `?width=${dims.width}&height=${dims.height}` +
        `&model=${encodeURIComponent(model)}&seed=${seed}&nologo=true`;

      const res = await fetch(url);
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new Error(`Pollinations responded ${res.status}: ${detail.slice(0, 200)}`);
      }

      const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      const dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;

      const asset = await this.media.register({
        workspaceId: params.workspaceId,
        type: MediaType.IMAGE,
        source: MediaSource.AI_GENERATED,
        url: dataUrl,
        filename: `pollinations-${seed}.${mimeType.split('/')[1] ?? 'jpg'}`,
        mimeType,
        sizeBytes: buf.length,
        width: dims.width,
        height: dims.height,
        aiPrompt: enrichedPrompt,
        aiModel: model,
      });
      assets.push(asset);
    }

    return { assets, model, count: assets.length };
  }

  private enrichPromptWithBrand(
    prompt: string,
    brandKit?: { primaryColor?: string | null; secondaryColor?: string | null; fontFamily?: string | null },
  ): string {
    const parts: string[] = [prompt];
    if (brandKit?.primaryColor) {
      parts.push(
        `Brand colors: ${brandKit.primaryColor}${brandKit.secondaryColor ? ` and ${brandKit.secondaryColor}` : ''}.`,
      );
    }
    if (brandKit?.fontFamily) {
      parts.push(`Typography style: ${brandKit.fontFamily}.`);
    }
    parts.push('Professional, social-media-ready composition.');
    return parts.join(' ');
  }
}
