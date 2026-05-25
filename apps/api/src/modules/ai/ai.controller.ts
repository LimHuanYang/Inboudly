import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { GenerateTextSchema, GenerateImageSchema } from '@inboudly/shared';

type TextProvider = 'claude' | 'gemini';
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
    const { provider, apiKey } = await this.resolveTextProvider(input.workspaceId);
    // resolveTextProvider returns 'claude' but the credentials store keys it as 'anthropic'.
    const modelProvider = provider === 'claude' ? 'anthropic' : provider;
    // Respect user's custom model override (e.g. claude-haiku-4-5 for cheaper)
    const model = await this.credentials.getModel(input.workspaceId, modelProvider);
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
    if (provider === 'openai') return this.openaiImage.generate(apiKey, args);
    return this.geminiImage.generate(apiKey, args);
  }

  private async resolveTextProvider(
    workspaceId: string,
  ): Promise<{ provider: TextProvider; apiKey: string }> {
    const record = await this.credentials.getRecord(workspaceId);
    const claudeKey = await this.credentials.getDecryptedKey(workspaceId, 'anthropicKey');
    const geminiKey = await this.credentials.getDecryptedKey(workspaceId, 'geminiKey');

    const preferred = record?.preferredTextProvider as TextProvider | null | undefined;
    if (preferred === 'claude' && claudeKey) return { provider: 'claude', apiKey: claudeKey };
    if (preferred === 'gemini' && geminiKey) return { provider: 'gemini', apiKey: geminiKey };

    if (claudeKey) return { provider: 'claude', apiKey: claudeKey };
    if (geminiKey) return { provider: 'gemini', apiKey: geminiKey };

    throw new BadRequestException(
      'No text AI provider configured for this workspace. Go to Settings → AI Providers and add either an Anthropic (Claude) or Google (Gemini) API key.',
    );
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
