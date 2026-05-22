import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { EmbeddingsService } from './embeddings.service';
import { MediaModule } from '../media/media.module';
import { BrandModule } from '../brand/brand.module';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [MediaModule, forwardRef(() => BrandModule), AiCredentialsModule],
  controllers: [AiController],
  providers: [
    ClaudeTextService,
    OpenAiImageService,
    GeminiTextService,
    GeminiImageService,
    EmbeddingsService,
  ],
  exports: [
    ClaudeTextService,
    OpenAiImageService,
    GeminiTextService,
    GeminiImageService,
    EmbeddingsService,
  ],
})
export class AiModule {}
