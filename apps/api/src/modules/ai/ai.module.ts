import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { EmbeddingsService } from './embeddings.service';
import { MediaModule } from '../media/media.module';
import { BrandModule } from '../brand/brand.module';

@Module({
  imports: [MediaModule, forwardRef(() => BrandModule)],
  controllers: [AiController],
  providers: [ClaudeTextService, OpenAiImageService, EmbeddingsService],
  exports: [ClaudeTextService, OpenAiImageService, EmbeddingsService],
})
export class AiModule {}
