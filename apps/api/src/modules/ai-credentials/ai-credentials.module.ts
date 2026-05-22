import { Module } from '@nestjs/common';
import { AiCredentialsService } from './ai-credentials.service';
import { AiCredentialsController } from './ai-credentials.controller';
import { ProviderTestService } from './provider-test.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Module({
  controllers: [AiCredentialsController],
  providers: [AiCredentialsService, ProviderTestService, WorkspacesService],
  exports: [AiCredentialsService],
})
export class AiCredentialsModule {}
