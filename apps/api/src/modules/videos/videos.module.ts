import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { FacelessVideoService } from './faceless-video.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [AiCredentialsModule],
  controllers: [VideosController],
  providers: [FacelessVideoService, WorkspacesService],
  exports: [FacelessVideoService],
})
export class VideosModule {}
