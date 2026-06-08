import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { PublishProcessor } from './publish.processor';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SocialAccountsModule } from '../social-accounts/social-accounts.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'publish' },
      { name: 'analytics-pull' },
      { name: 'trend-scan' },
    ),
    ConnectorsModule,
    SocialAccountsModule,
  ],
  providers: [SchedulerService, PublishProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
