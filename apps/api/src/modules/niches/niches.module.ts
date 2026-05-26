import { Module } from '@nestjs/common';
import { NichesController } from './niches.controller';
import { NicheIntelligenceService } from './niche-intelligence.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [AiCredentialsModule],
  controllers: [NichesController],
  providers: [NicheIntelligenceService, WorkspacesService],
  exports: [NicheIntelligenceService],
})
export class NichesModule {}
