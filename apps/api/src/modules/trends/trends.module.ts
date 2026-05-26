import { Module } from '@nestjs/common';
import { TrendsController } from './trends.controller';
import { TrendRadarService } from './trend-radar.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [AiCredentialsModule],
  controllers: [TrendsController],
  providers: [TrendRadarService, WorkspacesService],
  exports: [TrendRadarService],
})
export class TrendsModule {}
