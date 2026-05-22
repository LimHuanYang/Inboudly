import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { MediaService } from '../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';

const ASPECT_TO_SIZE: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
  '1:1': '1024x1024',
  '4:5': '1024x1536',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
  '2:3': '1024x1536',
  '16:9': '1536x1024',
  '1.91:1': '1536x1024',
};

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
      brandKit?: {
        primaryColor?: string | null;
        secondaryColor?: string | null;
        fontFamily?: string | null;
      };
    },
  ) {
    const client = new OpenAI({ apiKey });
    const size = ASPECT_TO_SIZE[params.aspectRatio ?? '1:1'] ?? '1024x1024';
    const count = params.count ?? 1;

    const enrichedPrompt = this.enrichPromptWithBrand(params.prompt, params.brandKit);

    const result = await client.images.generate({
      model: 'gpt-image-1',
      prompt: enrichedPrompt,
      size,
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
          aiModel: 'gpt-image-1',
        });
      }),
    );

    return { assets, model: 'gpt-image-1', count: assets.length };
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
