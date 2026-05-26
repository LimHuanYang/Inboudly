import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from './common/prisma/prisma.module';
import { PineconeModule } from './common/pinecone/pinecone.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AiCredentialsModule } from './modules/ai-credentials/ai-credentials.module';
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
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { OAuthModule } from './modules/oauth/oauth.module';
import { KolModule } from './modules/kol/kol.module';
import { CompetitorsModule } from './modules/competitors/competitors.module';
import { TrendsModule } from './modules/trends/trends.module';
import { NichesModule } from './modules/niches/niches.module';
import { VideosModule } from './modules/videos/videos.module';

@Module({
  imports: [
    // Load env from monorepo root first, then app-local as fallback.
    // Without this, NestJS only looks at apps/api/.env (process.cwd) and
    // misses the SUPABASE_URL / GEMINI_API_KEY / etc. you set at the root.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        // Stop the ECONNREFUSED retry spam in dev when Redis isn't running.
        // After 5 attempts the client gives up. The rest of the API
        // (composer, virality, BYOK) keeps working — only scheduling +
        // repurpose worker need Redis, and they'll fail loudly when invoked.
        retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
        reconnectOnError: () => false,
      },
    }),
    PrismaModule,
    PineconeModule,
    CryptoModule,

    // Feature modules
    AiCredentialsModule,
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
    ConnectorsModule,
    OAuthModule,
    KolModule,
    CompetitorsModule,
    TrendsModule,
    NichesModule,
    VideosModule,
  ],
})
export class AppModule {}
