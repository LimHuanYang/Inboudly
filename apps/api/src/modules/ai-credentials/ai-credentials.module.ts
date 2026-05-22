import { Module } from '@nestjs/common';
import { AiCredentialsService } from './ai-credentials.service';
import { AiCredentialsController } from './ai-credentials.controller';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Module({
  controllers: [AiCredentialsController],
  providers: [AiCredentialsService, WorkspacesService],
  exports: [AiCredentialsService],
})
export class AiCredentialsModule {}
