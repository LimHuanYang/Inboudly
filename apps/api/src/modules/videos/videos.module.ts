import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosController } from './videos.controller';
import { FacelessVideoService } from './faceless-video.service';
import { VideoExportProcessor } from './video-export.processor';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';
import { MediaModule } from '../media/media.module';
import { FfmpegService } from '../repurpose/ffmpeg.service';

// Mirror app.module's queue gate: the BullMQ root + queues only load when
// REDIS_URL is set OR ENABLE_QUEUES=true. This module is imported
// UNCONDITIONALLY by app.module, so it must self-gate its queue pieces —
// otherwise local dev (no Redis) has no forRoot/queue token and Nest throws
// at boot. Non-queue providers/controllers stay always-on.
const QUEUES_ENABLED = !!process.env.REDIS_URL || process.env.ENABLE_QUEUES === 'true';

@Module({
  // MediaModule re-exports R2StorageService so FacelessVideoService can
  // upload ElevenLabs MP3s straight to Cloudflare R2.
  // FfmpegService is provided locally (repurpose.module does not export it).
  imports: [
    ...(QUEUES_ENABLED ? [BullModule.registerQueue({ name: 'video-export' })] : []),
    AiCredentialsModule,
    MediaModule,
  ],
  controllers: [VideosController],
  providers: [
    FacelessVideoService,
    ...(QUEUES_ENABLED ? [VideoExportProcessor] : []),
    WorkspacesService,
    FfmpegService,
  ],
  exports: [FacelessVideoService],
})
export class VideosModule {}
