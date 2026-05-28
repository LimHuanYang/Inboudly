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

// Queues (BullMQ) require Redis. The two queue feature modules register
// WorkerHost processors that EAGERLY connect to Redis at boot — if Redis
// isn't running, the worker's final connection error becomes an unhandled
// rejection and crashes the whole API before it binds its port (taking down
// every other feature with it).
//
// So we gate the Redis-dependent pieces behind an explicit signal: queues
// load only when REDIS_URL is set OR ENABLE_QUEUES=true. Local dev without
// Redis boots clean (scheduling + repurpose worker simply unavailable);
// production sets REDIS_URL and gets the full pipeline. Nothing outside the
// scheduler/ + repurpose/ folders depends on these, so gating is safe.
const QUEUES_ENABLED =
  !!process.env.REDIS_URL || process.env.ENABLE_QUEUES === 'true';

const queueImports = QUEUES_ENABLED
  ? [
      BullModule.forRoot({
        connection: {
          url: process.env.REDIS_URL ?? 'redis://localhost:6379',
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false,
          retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
          reconnectOnError: () => false,
        },
      }),
      SchedulerModule,
      RepurposeModule,
    ]
  : [];

if (!QUEUES_ENABLED) {
  // eslint-disable-next-line no-console
  console.warn(
    '⚠ Queues disabled (no REDIS_URL / ENABLE_QUEUES). Scheduling + repurpose ' +
      'worker are off. Everything else (composer, intelligence, videos, BYOK) works. ' +
      'Set REDIS_URL + run Redis to enable.',
  );
}

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
    ...queueImports,
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
    ApprovalsModule,
    CommentsModule,
    AnalyticsModule,
    AiModule,
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
