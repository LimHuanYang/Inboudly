import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RepurposeController } from './repurpose.controller';
import { RepurposeService } from './repurpose.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'repurpose' })],
  controllers: [RepurposeController],
  providers: [RepurposeService],
  exports: [RepurposeService],
})
export class RepurposeModule {}
