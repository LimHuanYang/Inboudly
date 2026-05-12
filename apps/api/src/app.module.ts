import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from './common/prisma/prisma.module';
import { PineconeModule } from './common/pinecone/pinecone.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { SocialAccountsModule } from './modules/social-accounts/social-accounts.module';
import { BrandModule } from './modules/brand/brand.module';
import { MediaModule } from './modules/media/media.module';
import { PostsModule } from './modules/posts/posts.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AiModule } from './modules/ai/ai.module';
import { RepurposeModule } from './modules/repurpose/repurpose.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    PrismaModule,
    PineconeModule,

    // Feature modules
    AuthModule,
    TenantsModule,
    WorkspacesModule,
    SocialAccountsModule,
    BrandModule,
    MediaModule,
    PostsModule,
    SchedulerModule,
    ApprovalsModule,
    CommentsModule,
    AnalyticsModule,
    AiModule,
    RepurposeModule,
    IntelligenceModule,
  ],
})
export class AppModule {}
