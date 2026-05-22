import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RepurposeController } from './repurpose.controller';
import { RepurposeService } from './repurpose.service';
import { RepurposeProcessor } from './repurpose.processor';
import { SourceResolverService } from './source-resolver.service';
import { TranscriptionService } from './transcription.service';
import { ClipSelectorService } from './clip-selector.service';
import { FfmpegService } from './ffmpeg.service';
import { MediaModule } from '../media/media.module';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'repurpose' }),
    MediaModule,
    AiCredentialsModule,
  ],
  controllers: [RepurposeController],
  providers: [
    RepurposeService,
    RepurposeProcessor,
    SourceResolverService,
    TranscriptionService,
    ClipSelectorService,
    FfmpegService,
  ],
  exports: [RepurposeService],
})
export class RepurposeModule {}
