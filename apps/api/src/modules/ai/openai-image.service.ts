import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { MediaService } from '../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';

const DEFAULT_MODEL = 'gpt-image-1';

const LANDSCAPE = new Set(['16:9', '1.91:1']);
const PORTRAIT = new Set(['4:5', '9:16', '3:4', '2:3']);

/**
 * Valid output sizes differ per model, so map per-model to avoid API errors:
 *   gpt-image-1 → 1024² / 1024×1536 / 1536×1024
 *   dall-e-3    → 1024² / 1024×1792 / 1792×1024
 *   dall-e-2    → 1024² only (square)
 */
function sizeForModel(model: string, aspectRatio?: string): string {
  const ar = aspectRatio ?? '1:1';
  if (model === 'dall-e-2') return '1024x1024';
  if (model === 'dall-e-3') {
    if (LANDSCAPE.has(ar)) return '1792x1024';
    if (PORTRAIT.has(ar)) return '1024x1792';
    return '1024x1024';
  }
  // gpt-image-1 (default)
  if (LANDSCAPE.has(ar)) return '1536x1024';
  if (PORTRAIT.has(ar)) return '1024x1536';
  return '1024x1024';
}

/**
 * BYOK: per-call API key. The caller (AiController) decrypts the workspace's
 * OpenAI key and passes it in. Customer is billed by OpenAI directly.
 */
@Injectable()
export class OpenAiImageService {
  constructor(private media: MediaService) {}

  async generate(
    apiKey: string,
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
    const client = new OpenAI({ apiKey });
    const model = params.model?.trim() || DEFAULT_MODEL;
    const size = sizeForModel(model, params.aspectRatio);
    // dall-e-3 only supports n=1; others allow batches.
    const count = model === 'dall-e-3' ? 1 : (params.count ?? 1);

    const enrichedPrompt = this.enrichPromptWithBrand(params.prompt, params.brandKit);

    const result = await client.images.generate({
      model,
      prompt: enrichedPrompt,
      size: size as '1024x1024',
      n: count,
    });

    const assets = await Promise.all(
      (result.data ?? []).map(async (img) => {
        const url = img.url ?? `data:image/png;base64,${img.b64_json}`;
        return this.media.register({
          workspaceId: params.workspaceId,
          type: MediaType.IMAGE,
          source: MediaSource.AI_GENERATED,
          url,
          filename: `ai-${Date.now()}.png`,
          mimeType: 'image/png',
          sizeBytes: 0,
          aiPrompt: enrichedPrompt,
          aiModel: model,
        });
      }),
    );

    return { assets, model, count: assets.length };
  }

  private enrichPromptWithBrand(
    prompt: string,
    brandKit?: { primaryColor?: string | null; secondaryColor?: string | null; fontFamily?: string | null },
  ): string {
    if (!brandKit) return prompt;
    const parts: string[] = [prompt];
    if (brandKit.primaryColor) {
      parts.push(
        `Brand color palette: ${brandKit.primaryColor}${brandKit.secondaryColor ? ` and ${brandKit.secondaryColor}` : ''}.`,
      );
    }
    if (brandKit.fontFamily) {
      parts.push(`Typography style: ${brandKit.fontFamily}.`);
    }
    parts.push('Professional, on-brand, social-media-ready composition.');
    return parts.join(' ');
  }
}
