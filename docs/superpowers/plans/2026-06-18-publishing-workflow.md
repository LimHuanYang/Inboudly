# Publishing Workflow (cron-based) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make scheduled posts actually publish — via an in-process `@Cron` that scans due posts and publishes them per-platform (idempotent, auto-retrying, partial-aware), with **no Redis dependency**.

**Architecture:** Extract the existing BullMQ `PublishProcessor` logic into a queue-agnostic `PostPublisherService.publishPost(postId)`. A `PostScheduleCron` (`@nestjs/schedule`, ~every minute — same pattern as the existing video reaper) atomically claims due `SCHEDULED` posts (and retry-due failed ones) and calls the publisher. The publisher skips platforms already `SUCCESS` (idempotent), records per-platform `PostPublication` with `retryCount`/`nextRetryAt`, and rolls the Post up to `PUBLISHED` / `PARTIALLY_PUBLISHED` / `FAILED`. The dead BullMQ scheduler is left dormant (Redis-gated, unused). Live since `posts.module` is always loaded.

**Tech Stack:** NestJS, `@nestjs/schedule` (`@Cron`), Prisma + Supabase Postgres, Jest. No BullMQ/Redis on this path.

**Design decisions (from the 2026-06-18 grill — see `docs/inboudly-roadmap.md`):** scheduling-first; DB-scan cron (not BullMQ); per-platform + idempotent + auto-retry; new `PARTIALLY_PUBLISHED` status; cancel just sets `CANCELLED` (cron ignores it); fix the hardcoded `language:'en'`; add `assertMember` IDOR guards; fire-time media-exists check; "Post now" as a thin add.

**Scope:** the publish trigger + execution. Out of scope: the analytics loop, composer entry redesign, the brand-voice moat (separate roadmap steps).

---

## File Structure

**CREATE (api):**
- `apps/api/src/modules/posts/post-publisher.service.ts` — queue-agnostic `publishPost(postId)` (the extracted + hardened publish logic). + `.spec.ts`
- `apps/api/src/modules/posts/post-schedule.cron.ts` — `@Cron` scanner that claims + dispatches due/retry-due posts. + `.spec.ts`

**MODIFY (api):**
- `apps/api/src/modules/posts/posts.module.ts` — register the two new providers; import `ConnectorsModule` + `SocialAccountsModule`.
- `apps/api/src/modules/posts/posts.controller.ts` — add `assertMember` to schedule/cancel/update/getById; add `POST /:id/publish-now`.
- `apps/api/src/modules/posts/posts.service.ts` — add `publishNow` passthrough (optional helper).

**MODIFY (db):**
- `packages/database/prisma/schema.prisma` — add `PARTIALLY_PUBLISHED` to `PostStatus`.

**MODIFY (shared):**
- `packages/shared/src/build-post-input.ts` — stop hardcoding `language:'en'`; carry the real per-platform language.

**KEEP / leave dormant:** `scheduler/publish.processor.ts` + `scheduler/scheduler.service.ts` (BullMQ path, Redis-gated, now superseded by the cron — do not delete in this plan, just stop relying on it).

---

## Task 1: Add `PARTIALLY_PUBLISHED` post status

**Files:** Modify `packages/database/prisma/schema.prisma` (enum `PostStatus`, currently at ~L340).

- [ ] **Step 1: Edit the enum** — add `PARTIALLY_PUBLISHED` after `PUBLISHED`:

```prisma
enum PostStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  SCHEDULED
  PUBLISHING
  PUBLISHED
  PARTIALLY_PUBLISHED
  FAILED
  CANCELLED
}
```

- [ ] **Step 2: Push + regenerate** (stop `pnpm dev` first if the Prisma client EPERM-locks on Windows):

Run: `cd packages/database && pnpm dotenv -e ../../.env -- prisma db push` then from repo root `pnpm db:generate`.
Expected: "in sync"; client regenerated. (Adding an enum value is non-destructive — no `--accept-data-loss` needed.)

- [ ] **Step 3: Commit** — `git add packages/database/prisma/schema.prisma && git commit -m "feat(db): add PARTIALLY_PUBLISHED post status"`

---

## Task 2: Fix the hardcoded variant language

**Files:** Modify `packages/shared/src/build-post-input.ts`; Test `packages/shared/src/build-post-input.spec.ts` (create if absent).

Context: `buildCreatePostInput` currently sets `language: 'en'` for every variant (~L28), so a RedNote 中文 caption is stored as English — breaks the bilingual product. The caller (Composer) knows each platform's language; thread it through.

- [ ] **Step 1: Write/extend the failing test**

```typescript
// build-post-input.spec.ts
import { buildCreatePostInput } from './build-post-input';

it('carries the per-platform language, not a hardcoded en', () => {
  const out = buildCreatePostInput({
    workspaceId: 'clxxxxxxxxxxxxxxxxxxxxxxx0',
    platforms: ['REDNOTE', 'LINKEDIN'],
    captions: { REDNOTE: '抹茶拿铁上线', LINKEDIN: 'New matcha latte' },
    hashtags: { REDNOTE: [], LINKEDIN: [] },
    mediaAssetIds: { REDNOTE: [], LINKEDIN: [] },
    languages: { REDNOTE: 'zh-CN', LINKEDIN: 'en' },
  } as never);
  const rn = out.variants.find((v) => v.platform === 'REDNOTE')!;
  const li = out.variants.find((v) => v.platform === 'LINKEDIN')!;
  expect(rn.language).toBe('zh-CN');
  expect(li.language).toBe('en');
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm --filter @inboudly/shared test -- build-post-input` (or the api jest if shared has no test script; report which). FAIL: language is 'en'.

- [ ] **Step 3: Implement** — read the current `buildCreatePostInput` signature first. Add an optional `languages?: Partial<Record<SocialPlatform, string>>` input; per variant use `languages?.[platform] ?? 'en'` instead of the hardcoded `'en'`. Keep the default `'en'` only as the fallback when no language is supplied (back-compat).

- [ ] **Step 4: Update the Composer caller** — in `apps/web/src/app/dashboard/composer/page.tsx`, find the `buildCreatePostInput(...)` call and pass `languages` derived from each platform's preset/active language (the per-platform preset language; default `'en'`, RedNote `'zh-CN'`). If presets don't exist yet, pass `REDNOTE: 'zh-CN'` and `'en'` for the rest as a sane interim.

- [ ] **Step 5: Build shared + test** — `pnpm --filter @inboudly/shared build && pnpm --filter @inboudly/shared test`; `pnpm --filter @inboudly/web type-check`. All green.

- [ ] **Step 6: Commit** — `git commit -am "fix(shared): post variants carry real per-platform language (EN/zh-CN)"`

---

## Task 3: `PostPublisherService` — queue-agnostic, idempotent, partial-aware (TDD)

**Files:** Create `apps/api/src/modules/posts/post-publisher.service.ts` + `post-publisher.service.spec.ts`.

This extracts `scheduler/publish.processor.ts`'s logic into a plain injectable, and HARDENS it: skip already-SUCCESS platforms (idempotent retry), record `nextRetryAt` on failure, fire-time media check, and roll up to the 3-way status.

- [ ] **Step 1: Write the failing test** (pure rollup + idempotency logic with mocks; no network)

```typescript
// post-publisher.service.spec.ts
import { PostPublisherService } from './post-publisher.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';

function makeDeps(overrides: any = {}) {
  const updates: any[] = [];
  const prisma = {
    post: {
      findUnique: jest.fn().mockResolvedValue(overrides.post),
      update: jest.fn((args: any) => { updates.push(args.data); return Promise.resolve({}); }),
    },
    postPublication: { upsert: jest.fn().mockResolvedValue({}) },
  } as any;
  const connectors = { get: () => ({ publish: jest.fn().mockResolvedValue({ platformPostId: 'p1', platformPostUrl: 'u1' }) }) } as any;
  const accounts = { updateTokens: jest.fn(), markNeedsReconnect: jest.fn() } as any;
  return { prisma, connectors, accounts, updates };
}

it('marks PARTIALLY_PUBLISHED when one platform has no active account', async () => {
  const post = {
    id: 'post1', workspaceId: 'w',
    variants: [
      { id: 'v-ig', platform: 'INSTAGRAM', media: [], publications: [] },
      { id: 'v-li', platform: 'LINKEDIN', media: [], publications: [] },
    ],
    workspace: { socialAccounts: [{ id: 'a-ig', platform: 'INSTAGRAM', status: 'ACTIVE' }] }, // no LINKEDIN
  };
  const { prisma, connectors, accounts, updates } = makeDeps({ post });
  const svc = new PostPublisherService(prisma, connectors, accounts);
  await svc.publishPost('post1');
  expect(updates.at(-1).status).toBe(PostStatus.PARTIALLY_PUBLISHED);
});

it('skips a platform whose publication is already SUCCESS (idempotent)', async () => {
  const publish = jest.fn().mockResolvedValue({ platformPostId: 'p', platformPostUrl: 'u' });
  const post = {
    id: 'post1', workspaceId: 'w',
    variants: [{ id: 'v-ig', platform: 'INSTAGRAM', media: [],
      publications: [{ socialAccountId: 'a-ig', status: PublicationStatus.SUCCESS }] }],
    workspace: { socialAccounts: [{ id: 'a-ig', platform: 'INSTAGRAM', status: 'ACTIVE' }] },
  };
  const { prisma, accounts, updates } = makeDeps({ post });
  const connectors = { get: () => ({ publish }) } as any;
  const svc = new PostPublisherService(prisma, connectors, accounts);
  await svc.publishPost('post1');
  expect(publish).not.toHaveBeenCalled();           // already-SUCCESS not re-published
  expect(updates.at(-1).status).toBe(PostStatus.PUBLISHED); // all (1/1) succeeded
});
```

- [ ] **Step 2: Run, verify it fails** — `pnpm --filter @inboudly/api test -- post-publisher` → class doesn't exist.

- [ ] **Step 3: Implement** `post-publisher.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import { SocialAccountsService } from '../social-accounts/social-accounts.service';

const SKEW_MS = 60_000;
export const MAX_RETRIES = 3;

/**
 * Publishes one post to every platform variant. Queue-agnostic — called by the
 * cron (PostScheduleCron) and the "Post now" endpoint. Idempotent: a platform
 * already SUCCESS is never re-published. Per-platform failures record
 * retryCount + nextRetryAt for the cron's retry pass. Rolls the Post up to
 * PUBLISHED / PARTIALLY_PUBLISHED / FAILED.
 */
@Injectable()
export class PostPublisherService {
  private readonly logger = new Logger(PostPublisherService.name);

  constructor(
    private prisma: PrismaService,
    private connectors: ConnectorRegistry,
    private accounts: SocialAccountsService,
  ) {}

  private async ensureUsableAccount(account: any, connector: { refreshToken?: (rt: string) => Promise<any> }) {
    const expired = account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + SKEW_MS;
    if (!expired || !connector.refreshToken || !account.refreshToken) return account;
    const fresh = await connector.refreshToken(account.refreshToken);
    return this.accounts.updateTokens(account.id, {
      accessToken: fresh.accessToken,
      tokenExpiresAt: fresh.expiresAt ?? null,
      refreshToken: fresh.refreshToken,
    });
  }

  private backoff(retryCount: number): Date {
    const mins = Math.min(2 ** retryCount * 5, 6 * 60); // 5,10,20… capped 6h
    return new Date(Date.now() + mins * 60_000);
  }

  async publishPost(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        variants: { include: { media: { include: { mediaAsset: true } }, publications: true } },
        workspace: { include: { socialAccounts: true } },
      },
    });
    if (!post) { this.logger.warn(`Post ${postId} not found`); return; }

    await this.prisma.post.update({ where: { id: postId }, data: { status: PostStatus.PUBLISHING } });

    let succeeded = 0;
    const total = post.variants.length;

    for (const variant of post.variants) {
      const account = post.workspace.socialAccounts.find(
        (a: any) => a.platform === variant.platform && a.status === 'ACTIVE',
      );
      const already = variant.publications?.find(
        (p: any) => p.socialAccountId === account?.id && p.status === PublicationStatus.SUCCESS,
      );
      if (already) { succeeded++; continue; } // idempotent — never re-publish a success

      if (!account) { this.logger.warn(`No active ${variant.platform} account for post ${postId}`); continue; }

      // fire-time media-readiness check
      const missingMedia = (variant.media ?? []).some((m: any) => !m.mediaAsset || !m.mediaAsset.url);
      if (missingMedia) {
        await this.recordFailure(variant.id, account.id, 'Attached media is not ready yet.');
        continue;
      }

      try {
        const connector = this.connectors.get(variant.platform);
        let usable = account;
        try {
          usable = await this.ensureUsableAccount(account, connector);
        } catch {
          await this.accounts.markNeedsReconnect(account.id);
          throw new Error(`${variant.platform} access expired — reconnect in Settings to publish.`);
        }
        const result = await connector.publish({ account: usable, variant: { ...variant, media: variant.media } });
        await this.prisma.postPublication.upsert({
          where: { postVariantId_socialAccountId: { postVariantId: variant.id, socialAccountId: account.id } },
          update: { status: PublicationStatus.SUCCESS, platformPostId: result.platformPostId, platformPostUrl: result.platformPostUrl, publishedAt: new Date(), errorMessage: null, nextRetryAt: null },
          create: { postVariantId: variant.id, socialAccountId: account.id, status: PublicationStatus.SUCCESS, platformPostId: result.platformPostId, platformPostUrl: result.platformPostUrl, publishedAt: new Date() },
        });
        succeeded++;
      } catch (err) {
        await this.recordFailure(variant.id, account.id, (err as Error).message);
      }
    }

    const status =
      succeeded === total ? PostStatus.PUBLISHED
        : succeeded > 0 ? PostStatus.PARTIALLY_PUBLISHED
          : PostStatus.FAILED;
    await this.prisma.post.update({
      where: { id: postId },
      data: { status, publishedAt: status === PostStatus.PUBLISHED ? new Date() : undefined },
    });
  }

  private async recordFailure(postVariantId: string, socialAccountId: string, message: string) {
    const existing = await this.prisma.postPublication.findUnique({
      where: { postVariantId_socialAccountId: { postVariantId, socialAccountId } },
    });
    const retryCount = (existing?.retryCount ?? 0) + 1;
    const nextRetryAt = retryCount <= MAX_RETRIES ? this.backoff(retryCount) : null;
    await this.prisma.postPublication.upsert({
      where: { postVariantId_socialAccountId: { postVariantId, socialAccountId } },
      update: { status: PublicationStatus.FAILED, errorMessage: message, retryCount, nextRetryAt },
      create: { postVariantId, socialAccountId, status: PublicationStatus.FAILED, errorMessage: message, retryCount, nextRetryAt },
    });
  }
}
```

> **Note:** confirm `PostPublication` has a nullable `nextRetryAt DateTime?` column (the trace says it does). If not, add it in Task 1's schema edit.

- [ ] **Step 4: Run the tests, verify pass** — `pnpm --filter @inboudly/api test -- post-publisher`.
- [ ] **Step 5: Commit** — `git add apps/api/src/modules/posts/post-publisher.service.* && git commit -m "feat(posts): PostPublisherService — idempotent, partial-aware publish"`

---

## Task 4: `PostScheduleCron` — claim due + retry-due posts (TDD)

**Files:** Create `apps/api/src/modules/posts/post-schedule.cron.ts` + `.spec.ts`.

- [ ] **Step 1: Write the failing test** (the atomic-claim guard — only publish if this instance won the claim)

```typescript
// post-schedule.cron.spec.ts
import { PostScheduleCron } from './post-schedule.cron';
import { PostStatus } from '@inboudly/database';

it('only publishes posts it successfully claims (count===1)', async () => {
  const due = [{ id: 'p1' }, { id: 'p2' }];
  const prisma = {
    post: {
      findMany: jest.fn().mockResolvedValue(due),
      updateMany: jest.fn()
        .mockResolvedValueOnce({ count: 1 })   // p1 claimed
        .mockResolvedValueOnce({ count: 0 }),  // p2 already taken by another scan
    },
    postPublication: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const publisher = { publishPost: jest.fn().mockResolvedValue(undefined) } as any;
  const cron = new PostScheduleCron(prisma, publisher);
  await cron.runDuePosts();
  expect(publisher.publishPost).toHaveBeenCalledTimes(1);
  expect(publisher.publishPost).toHaveBeenCalledWith('p1');
});
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `post-schedule.cron.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';
import { PostPublisherService, MAX_RETRIES } from './post-publisher.service';

/**
 * In-process scheduler — no Redis. Every minute: claim due SCHEDULED posts
 * (atomic status flip so overlapping scans can't double-fire) and publish them,
 * plus retry posts with failed platforms whose nextRetryAt has passed.
 * Same pattern as VideoGenerationService.reapStaleJobs.
 */
@Injectable()
export class PostScheduleCron {
  private readonly logger = new Logger(PostScheduleCron.name);

  constructor(private prisma: PrismaService, private publisher: PostPublisherService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runDuePosts(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.post.findMany({
      where: { status: PostStatus.SCHEDULED, scheduledFor: { lte: now } },
      select: { id: true }, take: 50,
    });
    for (const { id } of due) {
      // atomic claim: only proceed if THIS update flips it (count===1)
      const claim = await this.prisma.post.updateMany({
        where: { id, status: PostStatus.SCHEDULED },
        data: { status: PostStatus.PUBLISHING },
      });
      if (claim.count !== 1) continue; // another scan got it
      try { await this.publisher.publishPost(id); }
      catch (e) { this.logger.error(`publish ${id} failed: ${(e as Error).message}`); }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailed(): Promise<void> {
    const now = new Date();
    // posts that are PARTIALLY_PUBLISHED/FAILED with a retry-due failed publication
    const candidates = await this.prisma.post.findMany({
      where: {
        status: { in: [PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED] },
        variants: { some: { publications: { some: {
          status: PublicationStatus.FAILED, nextRetryAt: { lte: now }, retryCount: { lt: MAX_RETRIES },
        } } } },
      },
      select: { id: true }, take: 25,
    });
    for (const { id } of candidates) {
      const claim = await this.prisma.post.updateMany({
        where: { id, status: { in: [PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED] } },
        data: { status: PostStatus.PUBLISHING },
      });
      if (claim.count !== 1) continue;
      try { await this.publisher.publishPost(id); } // skips SUCCESS, retries FAILED
      catch (e) { this.logger.error(`retry ${id} failed: ${(e as Error).message}`); }
    }
  }
}
```

- [ ] **Step 4: Run the test, verify pass.**
- [ ] **Step 5: Commit** — `git add apps/api/src/modules/posts/post-schedule.cron.* && git commit -m "feat(posts): cron publisher — claims due + retries failed (no Redis)"`

---

## Task 5: Wire into `posts.module`

**Files:** Modify `apps/api/src/modules/posts/posts.module.ts`.

- [ ] **Step 1: Update the module:**

```typescript
import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostPublisherService } from './post-publisher.service';
import { PostScheduleCron } from './post-schedule.cron';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SocialAccountsModule } from '../social-accounts/social-accounts.module';

@Module({
  imports: [ConnectorsModule, SocialAccountsModule],
  controllers: [PostsController],
  providers: [PostsService, PostPublisherService, PostScheduleCron, WorkspacesService],
  exports: [PostsService, PostPublisherService],
})
export class PostsModule {}
```

> Confirm `ConnectorsModule` exports `ConnectorRegistry` and `SocialAccountsModule` exports `SocialAccountsService` (the BullMQ `SchedulerModule` imported both the same way, so they do). If `WorkspacesService` is already provided elsewhere causing a duplicate-provider issue, keep the existing arrangement.

- [ ] **Step 2: Type-check + boot** — `pnpm --filter @inboudly/api type-check`; then `pnpm dev` and confirm the API boots clean (no `UnknownDependenciesException`, no Redis needed) and logs no cron errors in the first 2 minutes.
- [ ] **Step 3: Commit** — `git commit -am "feat(posts): register cron publisher in always-on posts module"`

---

## Task 6: IDOR guards on post mutations

**Files:** Modify `apps/api/src/modules/posts/posts.controller.ts`.

Context: `create` + `list` call `workspaces.assertMember`, but `schedule`/`cancel`/`update`/`getById` do not — any authed user can mutate another workspace's post by id.

- [ ] **Step 1: Read the controller**, then for `schedule`, `cancel`, `update` (`PATCH :id`), and `getById` (`GET :id`): load the post's `workspaceId` (via `PostsService.getById` or a light `prisma.post.findUnique({select:{workspaceId:true}})`) and call `await this.workspaces.assertMember(workspaceId, user.supabaseUserId)` before mutating. Match the exact pattern `create`/`list` already use (inject `CurrentUser`, `WorkspacesService`).
- [ ] **Step 2: Add/extend a spec** asserting a non-member gets `ForbiddenException` (or whatever `assertMember` throws) for `schedule`. If controller unit-testing isn't set up, verify via type-check + a manual note.
- [ ] **Step 3: Type-check** — `pnpm --filter @inboudly/api type-check`.
- [ ] **Step 4: Commit** — `git commit -am "fix(posts): assertMember on schedule/cancel/update/get (IDOR)"`

---

## Task 7: "Post now" endpoint (thin)

**Files:** Modify `apps/api/src/modules/posts/posts.controller.ts` (+ `posts.service.ts` if you add a passthrough).

- [ ] **Step 1: Add the route** — `POST /posts/:id/publish-now`, guarded by `SupabaseAuthGuard` + `assertMember` (load workspaceId as in Task 6), then `await this.publisher.publishPost(id)` and return the refreshed post (`PostsService.getById(id)`). Inject `PostPublisherService` into the controller. This fires the SAME publish path immediately (great for live-testing without waiting for the cron).
- [ ] **Step 2: Type-check.**
- [ ] **Step 3: Commit** — `git commit -am "feat(posts): POST /:id/publish-now (immediate publish)"`

---

## Task 8: Validation + manual smoke

- [ ] **Step 1: Full type-check** — `pnpm type-check` → 4/4 clean.
- [ ] **Step 2: API tests** — `pnpm --filter @inboudly/api test` → green (incl. the new publisher + cron specs).
- [ ] **Step 3: Boot** — `pnpm dev`; confirm clean boot with NO Redis (the cron path must not depend on it). Watch ~2 min: no cron exceptions.
- [ ] **Step 4: Manual smoke (needs a connected account + Gemini key).** Create a post, schedule it ~2 minutes out; watch the cron pick it up → status SCHEDULED → PUBLISHING → PUBLISHED/PARTIALLY_PUBLISHED; verify `PostPublication` rows. Then test `POST /:id/publish-now` for an immediate publish. Then test a deliberate failure (disconnect one platform) → PARTIALLY_PUBLISHED + a FAILED publication with `nextRetryAt`; confirm the retry pass re-attempts only the failed platform and does NOT re-publish the successful one.
- [ ] **Step 5: Open PR / report** with the manual smoke results.

---

## Self-Review

**Spec coverage:** scheduling-first cron (T4) · DB-scan no-Redis (T4, T5 always-on module) · per-platform idempotent (T3 skip-SUCCESS) · auto-retry (T3 nextRetryAt + T4 retryFailed) · PARTIALLY_PUBLISHED (T1, T3 rollup) · cancel-just-works (cron only selects SCHEDULED, so CANCELLED is ignored — no code needed, ✓) · language fix (T2) · IDOR (T6) · media-readiness (T3 missingMedia) · Post-now (T7). BullMQ scheduler left dormant (architecture note).

**Placeholder scan:** the only "confirm against codebase" notes are (a) `nextRetryAt` column exists on `PostPublication` (trace says yes — verify in T3), (b) ConnectorsModule/SocialAccountsModule exports (the BullMQ module imported them identically), (c) `buildCreatePostInput`'s real signature (read in T2). All are verifications with real code written, not deferred work.

**Type consistency:** `publishPost(postId)` signature is identical in T3 (definition), T4 (cron call), T7 (controller call). `MAX_RETRIES` exported from the publisher and imported by the cron. `PostStatus.PARTIALLY_PUBLISHED` (T1) used in T3 rollup + T4 retry query. `PublicationStatus.SUCCESS/FAILED` consistent with the existing processor.

**Known follow-ups (out of scope):** delete the dormant BullMQ `scheduler/` once confident; the cron retry cap (3) + backoff are defaults — tune later; "best time to post" insight is the analytics step, not here.
