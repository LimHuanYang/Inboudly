import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { PublishProcessor } from './publish.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'publish' },
      { name: 'analytics-pull' },
      { name: 'trend-scan' },
    ),
  ],
  providers: [SchedulerService, PublishProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
