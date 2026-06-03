import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { PollinationsImageService } from './pollinations-image.service';
import { EmbeddingsService } from './embeddings.service';
import { DemoVideoProvider } from './video/demo-video.provider';
import { VideoGenerationService } from './video/video-generation.service';
import { VideoGenerationController } from './video/video-generation.controller';
import { MediaModule } from '../media/media.module';
import { BrandModule } from '../brand/brand.module';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [MediaModule, forwardRef(() => BrandModule), AiCredentialsModule],
  controllers: [AiController, VideoGenerationController],
  providers: [
    ClaudeTextService,
    OpenAiImageService,
    GeminiTextService,
    GeminiImageService,
    PollinationsImageService,
    EmbeddingsService,
    DemoVideoProvider,
    VideoGenerationService,
  ],
  exports: [
    ClaudeTextService,
    OpenAiImageService,
    GeminiTextService,
    GeminiImageService,
    PollinationsImageService,
    EmbeddingsService,
    VideoGenerationService,
  ],
})
export class AiModule {}
