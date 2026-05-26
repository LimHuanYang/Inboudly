import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { FacelessVideoService } from './faceless-video.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';
import { MediaModule } from '../media/media.module';

@Module({
  // MediaModule re-exports R2StorageService so FacelessVideoService can
  // upload ElevenLabs MP3s straight to Cloudflare R2.
  imports: [AiCredentialsModule, MediaModule],
  controllers: [VideosController],
  providers: [FacelessVideoService, WorkspacesService],
  exports: [FacelessVideoService],
})
export class VideosModule {}
