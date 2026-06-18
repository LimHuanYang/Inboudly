import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'analytics-pull' },
      { name: 'trend-scan' },
    ),
  ],
  providers: [],
  exports: [],
})
export class SchedulerModule {}
