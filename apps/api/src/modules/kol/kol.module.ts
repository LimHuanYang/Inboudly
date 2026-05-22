import { Module } from '@nestjs/common';
import { KolController } from './kol.controller';
import { KolService } from './kol.service';
import { KolAnalysisService } from './kol-analysis.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiCredentialsModule, AiModule],
  controllers: [KolController],
  providers: [KolService, KolAnalysisService, WorkspacesService],
  exports: [KolService, KolAnalysisService],
})
export class KolModule {}
