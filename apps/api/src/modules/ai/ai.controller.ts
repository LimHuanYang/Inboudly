import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { GenerateTextSchema, GenerateImageSchema } from '@inboudly/shared';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private text: ClaudeTextService, private image: OpenAiImageService) {}

  @Post('text')
  async generateText(@Body() body: unknown) {
    const input = GenerateTextSchema.parse(body);
    return this.text.generatePostText(input);
  }

  @Post('image')
  async generateImage(@Body() body: unknown) {
    const input = GenerateImageSchema.parse(body);
    return this.image.generate({
      workspaceId: input.workspaceId,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      count: input.count,
    });
  }
}
