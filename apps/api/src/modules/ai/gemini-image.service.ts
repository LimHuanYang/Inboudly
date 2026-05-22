import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MediaService } from '../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';

const MODEL = 'gemini-2.5-flash-image'; // "Nano Banana"

/**
 * BYOK: per-call API key. Note: Gemini's free tier does NOT include image
 * generation (limit: 0) — the customer needs paid Google Cloud billing on
 * their project for this to actually return an image.
 */
@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);

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
    const client = new GoogleGenerativeAI(apiKey);
    const count = params.count ?? 1;
    const enrichedPrompt = this.enrichPromptWithBrand(params.prompt, params.brandKit, params.aspectRatio);

    const model = client.getGenerativeModel({
      model: MODEL,
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as never,
    });

    const assets = [];

    for (let i = 0; i < count; i++) {
      const res = await model.generateContent(enrichedPrompt);
      const candidate = res.response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((p) => 'inlineData' in p && p.inlineData);

      if (!imagePart || !('inlineData' in imagePart) || !imagePart.inlineData) {
        this.logger.warn('Gemini did not return an image — skipping');
        continue;
      }

      const mimeType = imagePart.inlineData.mimeType ?? 'image/png';
      const dataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;

      const asset = await this.media.register({
        workspaceId: params.workspaceId,
        type: MediaType.IMAGE,
        source: MediaSource.AI_GENERATED,
        url: dataUrl,
        filename: `gemini-${Date.now()}-${i}.${mimeType.split('/')[1] ?? 'png'}`,
        mimeType,
        sizeBytes: 0,
        aiPrompt: enrichedPrompt,
        aiModel: MODEL,
      });
      assets.push(asset);
    }

    return { assets, model: MODEL, count: assets.length };
  }

  private enrichPromptWithBrand(
    prompt: string,
    brandKit?: { primaryColor?: string | null; secondaryColor?: string | null; fontFamily?: string | null },
    aspectRatio?: string,
  ): string {
    const parts: string[] = [prompt];
    if (aspectRatio) {
      const aspectHint: Record<string, string> = {
        '1:1': 'Square composition (1:1 aspect ratio).',
        '4:5': 'Portrait composition (4:5 aspect ratio).',
        '9:16': 'Tall vertical composition (9:16 aspect ratio).',
        '16:9': 'Wide landscape composition (16:9 aspect ratio).',
      };
      const hint = aspectHint[aspectRatio];
      if (hint) parts.push(hint);
    }
    if (brandKit?.primaryColor) {
      parts.push(
        `Brand color palette: ${brandKit.primaryColor}${brandKit.secondaryColor ? ` and ${brandKit.secondaryColor}` : ''}.`,
      );
    }
    if (brandKit?.fontFamily) {
      parts.push(`Typography style: ${brandKit.fontFamily}.`);
    }
    parts.push('Professional, on-brand, social-media-ready composition.');
    return parts.join(' ');
  }
}
