import { Module, forwardRef } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { VoiceTrainingService } from './voice-training.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiModule } from '../ai/ai.module';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [forwardRef(() => AiModule), AiCredentialsModule],
  controllers: [BrandController],
  providers: [BrandService, VoiceTrainingService, WorkspacesService],
  exports: [BrandService, VoiceTrainingService],
})
export class BrandModule {}
