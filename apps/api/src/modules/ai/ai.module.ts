import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { EmbeddingsService } from './embeddings.service';
import { HiggsfieldVideoProvider } from './video/higgsfield-video.provider';
import { VideoGenerationService } from './video/video-generation.service';
import { VideoGenerationController } from './video/video-generation.controller';
import { MediaModule } from '../media/media.module';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { BrandModule } from '../brand/brand.module';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [MediaModule, forwardRef(() => BrandModule), AiCredentialsModule],
  controllers: [AiController, VideoGenerationController],
  providers: [
    GeminiTextService,
    GeminiImageService,
    EmbeddingsService,
    HiggsfieldVideoProvider,
    VideoGenerationService,
    WorkspacesService,
  ],
  exports: [
    GeminiTextService,
    GeminiImageService,
    EmbeddingsService,
    VideoGenerationService,
  ],
})
export class AiModule {}
