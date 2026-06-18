import {
  BadRequestException, Body, Controller, HttpException, Logger, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import {
  GenerateTextSchema, GenerateImageSchema,
  type GenerateTextInput, type GenerateImageInput,
} from '@inboudly/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Single-vendor BYOK: Gemini powers both captions and images. The workspace
 * supplies one Google AI Studio key (free tier covers captions). Inboudly
 * never bills for AI usage.
 */
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private gemini: GeminiTextService,
    private geminiImage: GeminiImageService,
    private credentials: AiCredentialsService,
  ) {}

  @Post('text')
  async generateText(
    @Body(new ZodValidationPipe(GenerateTextSchema)) input: GenerateTextInput,
  ) {
    const { apiKey, model } = await this.credentials.requireTextProvider(input.workspaceId);
    return this.gemini.generatePostText(apiKey, { ...input, model });
  }

  @Post('image')
  async generateImage(
    @Body(new ZodValidationPipe(GenerateImageSchema)) input: GenerateImageInput,
  ) {
    const { apiKey, model } = await this.credentials.requireImageProvider(input.workspaceId);
    try {
      const result = await this.geminiImage.generate(apiKey, {
        workspaceId: input.workspaceId,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        count: input.count,
        model,
      });
      if (!result?.assets?.length) throw new BadRequestException(this.imageHint());
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Gemini image gen failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(this.imageHint());
    }
  }

  private imageHint(): string {
    return `Gemini's free tier doesn't include image generation. Enable paid Google Cloud billing on your key's project, then try again.`;
  }
}
