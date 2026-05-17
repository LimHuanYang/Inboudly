import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import { MediaService } from '../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';

const MODEL = 'gemini-2.5-flash-image-preview'; // "Nano Banana" — Gemini's image gen model

/**
 * Gemini image generation fallback.
 *
 * Gemini's image generation returns base64 data inline in the response.
 * For testing we store it as a data: URL on the MediaAsset. In production
 * (when the operator wires up R2) the data should be uploaded to object
 * storage and the public URL stored instead — same flow as the OpenAI
 * service.
 */
@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);
  private client: GoogleGenAI;

  constructor(private media: MediaService) {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
  }

  async generate(params: {
    workspaceId: string;
    prompt: string;
    aspectRatio?: string;
    count?: number;
    brandKit?: {
      primaryColor?: string | null;
      secondaryColor?: string | null;
      fontFamily?: string | null;
    };
  }) {
    const count = params.count ?? 1;
    const enrichedPrompt = this.enrichPromptWithBrand(params.prompt, params.brandKit, params.aspectRatio);

    const assets = [];

    // Gemini image API generates 1 image per request — loop for count
    for (let i = 0; i < count; i++) {
      const res = await this.client.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: enrichedPrompt }] }],
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });

      const candidate = res.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);
      if (!imagePart?.inlineData?.data) {
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
      // Gemini doesn't expose aspect ratio as a separate param; we ask in the prompt.
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
