import {
  BadRequestException, Body, Controller, HttpException, Logger, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { PollinationsImageService } from './pollinations-image.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import {
  GenerateTextSchema,
  GenerateImageSchema,
  type GenerateTextInput,
  type GenerateImageInput,
} from '@inboudly/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

type ImageProvider = 'openai' | 'gemini' | 'pollinations';

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
    private pollinationsImage: PollinationsImageService,
    private credentials: AiCredentialsService,
  ) {}

  @Post('text')
  async generateText(
    @Body(new ZodValidationPipe(GenerateTextSchema)) input: GenerateTextInput,
  ) {
    // Shared resolver — same logic powers Composer, Repurpose, and
    // CompetitorAnalysisService. Throws 400 if no provider configured.
    const { provider, apiKey, model } = await this.credentials.requireTextProvider(input.workspaceId);
    if (provider === 'claude') {
      return this.claude.generatePostText(apiKey, { ...input, model });
    }
    return this.gemini.generatePostText(apiKey, { ...input, model });
  }

  @Post('image')
  async generateImage(
    @Body(new ZodValidationPipe(GenerateImageSchema)) input: GenerateImageInput,
  ) {
    // Shared resolver — honours preferredImageProvider + returns the chosen
    // image model. Throws 400 if no image provider is configured.
    const { provider, apiKey, model } = await this.credentials.requireImageProvider(input.workspaceId);
    const args = {
      workspaceId: input.workspaceId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      count: input.count,
      model,
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
          : provider === 'gemini'
            ? await this.geminiImage.generate(apiKey, args)
            : await this.pollinationsImage.generate(apiKey, args);

      if (!result?.assets?.length) {
        this.logger.warn(`Image generation via ${provider} returned no assets`);
        throw new BadRequestException(this.imageHint(provider));
      }
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err; // already a clean 4xx
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Image generation via ${provider} failed: ${msg}`);
      throw new BadRequestException(this.imageHint(provider));
    }
  }

  private readonly logger = new Logger(AiController.name);

  /**
   * Build a clear, friendly, provider-aware error message for image-gen
   * failures. The raw provider error is logged server-side (above); users
   * get actionable guidance, not a stack trace.
   */
  private imageHint(provider: ImageProvider): string {
    if (provider === 'gemini') {
      return `Gemini's free tier doesn't include image generation. Enable paid Google Cloud billing on your key's project, or switch to the free Pollinations provider in Settings → AI defaults.`;
    }
    if (provider === 'pollinations') {
      return `The free image service (Pollinations) didn't respond in time. It can be slow or rate-limited during busy periods — wait a moment and try again, or add an OpenAI key in Settings → AI Providers for more reliable results.`;
    }
    return `OpenAI couldn't generate the image. Check that your OpenAI key has image access (gpt-image-1 / DALL·E) and available credit.`;
  }
}
