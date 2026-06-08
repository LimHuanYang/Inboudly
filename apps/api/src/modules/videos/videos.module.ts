import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosController } from './videos.controller';
import { FacelessVideoService } from './faceless-video.service';
import { VideoExportProcessor } from './video-export.processor';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';
import { MediaModule } from '../media/media.module';
import { FfmpegService } from '../repurpose/ffmpeg.service';

@Module({
  // MediaModule re-exports R2StorageService so FacelessVideoService can
  // upload ElevenLabs MP3s straight to Cloudflare R2.
  // FfmpegService is provided locally (repurpose.module does not export it).
  imports: [
    BullModule.registerQueue({ name: 'video-export' }),
    AiCredentialsModule,
    MediaModule,
  ],
  controllers: [VideosController],
  providers: [FacelessVideoService, VideoExportProcessor, WorkspacesService, FfmpegService],
  exports: [FacelessVideoService],
})
export class VideosModule {}
