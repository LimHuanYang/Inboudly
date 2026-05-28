import {
  BadRequestException, Body, Controller, HttpException, Logger, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { GenerateTextSchema, GenerateImageSchema } from '@inboudly/shared';

type ImageProvider = 'openai' | 'gemini';

/**
 * BYOK provider resolution:
 *
 *   1. Look up the workspace's saved AI credentials.
 *   2. If a preferred provider is set AND we have the key for it → use that.
 *   3. Else: Anthropic > Gemini for text, OpenAI > Gemini for image.
 *   4. If no provider key configured at all → 400 with a clear "go to
 *      Settings → AI Providers and add a key" message.
 *
 * Each customer pays their own AI provider. Inboudly never bills for AI usage.
 */
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private claude: ClaudeTextService,
    private openaiImage: OpenAiImageService,
    private gemini: GeminiTextService,
    private geminiImage: GeminiImageService,
    private credentials: AiCredentialsService,
  ) {}

  @Post('text')
  async generateText(@Body() body: unknown) {
    const input = GenerateTextSchema.parse(body);
    // Shared resolver — same logic powers Composer, Repurpose, and
    // CompetitorAnalysisService. Throws 400 if no provider configured.
    const { provider, apiKey, model } = await this.credentials.requireTextProvider(input.workspaceId);
    if (provider === 'claude') {
      return this.claude.generatePostText(apiKey, { ...input, model });
    }
    return this.gemini.generatePostText(apiKey, { ...input, model });
  }

  @Post('image')
  async generateImage(@Body() body: unknown) {
    const input = GenerateImageSchema.parse(body);
    const { provider, apiKey } = await this.resolveImageProvider(input.workspaceId);
    const args = {
      workspaceId: input.workspaceId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      count: input.count,
    };

    // Provider SDK errors (bad key, quota, billing-not-enabled) would
    // otherwise bubble up as an opaque 500. Translate them into a clean,
    // actionable 400 so the Composer can toast something useful. The
    // classic case: Gemini's free tier has an image-gen limit of 0, so
    // gemini-2.5-flash-image throws unless the user enabled paid billing.
    try {
      const result =
        provider === 'openai'
          ? await this.openaiImage.generate(apiKey, args)
          : await this.geminiImage.generate(apiKey, args);

      if (!result?.assets?.length) {
        throw new BadRequestException(this.imageHint(provider, 'returned no image'));
      }
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err; // already a clean 4xx
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Image generation via ${provider} failed: ${msg}`);
      throw new BadRequestException(this.imageHint(provider, msg));
    }
  }

  private readonly logger = new Logger(AiController.name);

  /** Build a clear, provider-aware error message for image-gen failures. */
  private imageHint(provider: ImageProvider, detail: string): string {
    if (provider === 'gemini') {
      return `Gemini image generation failed (${detail}). Gemini's free tier does NOT include image generation — enable paid Google Cloud billing on your key's project, OR add an OpenAI key in Settings → AI Providers (Inboudly prefers OpenAI for images).`;
    }
    return `OpenAI image generation failed (${detail}). Check your OpenAI key has image (gpt-image-1 / DALL·E) access and available credit.`;
  }

  private async resolveImageProvider(
    workspaceId: string,
  ): Promise<{ provider: ImageProvider; apiKey: string }> {
    const record = await this.credentials.getRecord(workspaceId);
    const openaiKey = await this.credentials.getDecryptedKey(workspaceId, 'openaiKey');
    const geminiKey = await this.credentials.getDecryptedKey(workspaceId, 'geminiKey');

    const preferred = record?.preferredImageProvider as ImageProvider | null | undefined;
    if (preferred === 'openai' && openaiKey) return { provider: 'openai', apiKey: openaiKey };
    if (preferred === 'gemini' && geminiKey) return { provider: 'gemini', apiKey: geminiKey };

    if (openaiKey) return { provider: 'openai', apiKey: openaiKey };
    if (geminiKey) return { provider: 'gemini', apiKey: geminiKey };

    throw new BadRequestException(
      'No image AI provider configured for this workspace. Go to Settings → AI Providers and add either an OpenAI or Google (Gemini) API key. Note: Gemini image generation requires paid Google Cloud billing.',
    );
  }
}
