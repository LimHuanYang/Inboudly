import { Module } from '@nestjs/common';
import { CompetitorsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';
import { CompetitorSnapshotService } from './competitor-snapshot.service';
import { CompetitorAnalysisService } from './competitor-analysis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [AiCredentialsModule],
  controllers: [CompetitorsController],
  providers: [
    CompetitorsService,
    CompetitorSnapshotService,
    CompetitorAnalysisService,
    WorkspacesService,
  ],
  exports: [CompetitorsService],
})
export class CompetitorsModule {}
