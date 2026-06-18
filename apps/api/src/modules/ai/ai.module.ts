import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { EmbeddingsService } from './embeddings.service';
import { DemoVideoProvider } from './video/demo-video.provider';
import { PollinationsVideoProvider } from './video/pollinations-video.provider';
import { RunwayVideoProvider } from './video/runway-video.provider';
import { KlingVideoProvider } from './video/kling-video.provider';
import { VeoVideoProvider } from './video/veo-video.provider';
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
    DemoVideoProvider,
    PollinationsVideoProvider,
    RunwayVideoProvider,
    KlingVideoProvider,
    VeoVideoProvider,
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
