import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { GenerateTextSchema, GenerateImageSchema } from '@inboudly/shared';

/**
 * Provider selection rules:
 *   - Text:  AI_TEXT_PROVIDER env wins; else use Anthropic if key set,
 *            else Gemini if key set
 *   - Image: AI_IMAGE_PROVIDER env wins; else use OpenAI if key set,
 *            else Gemini if key set
 *
 * Defaults let new operators test for free with just a Gemini key.
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
  ) {}

  private resolveTextProvider() {
    const forced = process.env.AI_TEXT_PROVIDER?.toLowerCase();
    if (forced === 'claude' || forced === 'anthropic') return this.claude;
    if (forced === 'gemini' || forced === 'google') return this.gemini;
    if (process.env.ANTHROPIC_API_KEY) return this.claude;
    if (process.env.GEMINI_API_KEY) return this.gemini;
    throw new Error(
      'No text AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env',
    );
  }

  private resolveImageProvider() {
    const forced = process.env.AI_IMAGE_PROVIDER?.toLowerCase();
    if (forced === 'openai' || forced === 'gpt') return this.openaiImage;
    if (forced === 'gemini' || forced === 'google') return this.geminiImage;
    if (process.env.OPENAI_API_KEY) return this.openaiImage;
    if (process.env.GEMINI_API_KEY) return this.geminiImage;
    throw new Error(
      'No image AI provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY in .env',
    );
  }

  @Post('text')
  async generateText(@Body() body: unknown) {
    const input = GenerateTextSchema.parse(body);
    return this.resolveTextProvider().generatePostText(input);
  }

  @Post('image')
  async generateImage(@Body() body: unknown) {
    const input = GenerateImageSchema.parse(body);
    return this.resolveImageProvider().generate({
      workspaceId: input.workspaceId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      count: input.count,
    });
  }
}
