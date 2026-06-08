import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPullProcessor } from './analytics-pull.processor';
import { ConnectorsModule } from '../connectors/connectors.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'analytics-pull' }),
    ConnectorsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsPullProcessor],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
