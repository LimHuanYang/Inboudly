import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  controllers: [AiController],
  providers: [ClaudeTextService, OpenAiImageService],
  exports: [ClaudeTextService, OpenAiImageService],
})
export class AiModule {}
