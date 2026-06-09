import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPullProcessor } from './analytics-pull.processor';
import { ConnectorsModule } from '../connectors/connectors.module';
import { WorkspacesService } from '../workspaces/workspaces.service';

// Mirror app.module's queue gate: the BullMQ root + queues only load when
// REDIS_URL is set OR ENABLE_QUEUES=true. This module is imported
// UNCONDITIONALLY by app.module, so it must self-gate its queue pieces —
// otherwise local dev (no Redis) has no forRoot/queue token and Nest throws
// at boot. Non-queue providers/controllers stay always-on.
const QUEUES_ENABLED = !!process.env.REDIS_URL || process.env.ENABLE_QUEUES === 'true';

@Module({
  imports: [
    ...(QUEUES_ENABLED ? [BullModule.registerQueue({ name: 'analytics-pull' })] : []),
    ConnectorsModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ...(QUEUES_ENABLED ? [AnalyticsPullProcessor] : []),
    WorkspacesService,
  ],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
