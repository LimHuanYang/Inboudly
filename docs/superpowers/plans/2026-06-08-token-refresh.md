# OAuth Token-Refresh-Before-Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Refresh an expiring OAuth access token before publishing (so scheduled posts don't 401), auto-mark an account "reconnect needed" when refresh fails, and stop the publish error log from capturing Bearer tokens. Applies to all keyed connectors (YouTube, TikTok).

**Architecture:** The BullMQ `publish` processor gains a small `ensureUsableAccount(account, connector)` step that refreshes via the connector's existing `refreshToken()` and persists through a new `SocialAccountsService.updateTokens`. A refresh failure flips the account to a new `AccountStatus.NEEDS_RECONNECT`, which the Settings connect row renders as a distinct amber state (per `docs/token-refresh-ui-design.html`).

**Tech Stack:** NestJS 10, Prisma 5 (`db push`), jest (mocked prisma/connectors), Next.js 15 + Tailwind.

**Design + mockup:** `docs/token-refresh-ui-design.html`. **Branch:** `feat/token-refresh`.

---

## File Structure
- **Modify** `packages/database/prisma/schema.prisma` — `AccountStatus` += `NEEDS_RECONNECT`.
- **Modify** `apps/api/src/modules/social-accounts/social-accounts.service.ts` (+ new `.spec.ts`) — `updateTokens` + `markNeedsReconnect`.
- **Modify** `apps/api/src/modules/scheduler/publish.processor.ts` (+ new `.spec.ts`) — refresh-before-publish + failure handling + log fix.
- **Modify** `apps/web/src/app/dashboard/settings/page.tsx` — render the `NEEDS_RECONNECT` connect-row state.
- (Calendar/Posts failed-post error surfacing — Task 4, if that UI shows publication errors.)

---

## Task 1: Prisma — add `NEEDS_RECONNECT`

**Files:** Modify `packages/database/prisma/schema.prisma`

- [ ] **Step 1:** In `enum AccountStatus { … }`, add `NEEDS_RECONNECT` (after the existing values, e.g. `ACTIVE`, `DISCONNECTED`).
- [ ] **Step 2:** `pnpm --filter @inboudly/database db:push && pnpm --filter @inboudly/database db:generate` → "in sync", client regenerated (additive enum value, no data loss).
- [ ] **Step 3:** Commit:
```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): add NEEDS_RECONNECT to AccountStatus" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `SocialAccountsService` — `updateTokens` + `markNeedsReconnect` (TDD)

**Files:** Modify `apps/api/src/modules/social-accounts/social-accounts.service.ts`; Test `…/social-accounts.service.spec.ts`

- [ ] **Step 1: Failing test** (`social-accounts.service.spec.ts`):
```ts
import { SocialAccountsService } from './social-accounts.service';
import { AccountStatus } from '@inboudly/database';

describe('SocialAccountsService token helpers', () => {
  function setup() {
    const update = jest.fn().mockResolvedValue({ id: 'a1' });
    const prisma = { socialAccount: { update } } as any;
    return { update, svc: new SocialAccountsService(prisma) };
  }
  it('updateTokens persists access token + expiry (+ refresh token when given)', async () => {
    const { update, svc } = setup();
    const exp = new Date();
    await svc.updateTokens('a1', { accessToken: 'at2', tokenExpiresAt: exp, refreshToken: 'rt2' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { accessToken: 'at2', tokenExpiresAt: exp, refreshToken: 'rt2' } });
  });
  it('updateTokens omits refreshToken when not provided', async () => {
    const { update, svc } = setup();
    await svc.updateTokens('a1', { accessToken: 'at2', tokenExpiresAt: null });
    expect(update.mock.calls[0][0].data).not.toHaveProperty('refreshToken');
  });
  it('markNeedsReconnect sets status NEEDS_RECONNECT', async () => {
    const { update, svc } = setup();
    await svc.markNeedsReconnect('a1');
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: AccountStatus.NEEDS_RECONNECT } });
  });
});
```
- [ ] **Step 2: Run, FAIL:** `pnpm --filter @inboudly/api test -- social-accounts.service` → methods missing.
- [ ] **Step 3: Implement** — add to `SocialAccountsService`:
```ts
  async updateTokens(
    id: string,
    tokens: { accessToken: string; tokenExpiresAt: Date | null; refreshToken?: string },
  ) {
    return this.prisma.socialAccount.update({
      where: { id },
      data: {
        accessToken: tokens.accessToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      },
    });
  }

  async markNeedsReconnect(id: string) {
    return this.prisma.socialAccount.update({
      where: { id },
      data: { status: AccountStatus.NEEDS_RECONNECT },
    });
  }
```
Add `AccountStatus` to the existing `@inboudly/database` import.
- [ ] **Step 4: Run, PASS + type-check:** `pnpm --filter @inboudly/api test -- social-accounts.service` → 3 pass; `pnpm --filter @inboudly/api type-check` → clean.
- [ ] **Step 5: Commit:** `git add apps/api/src/modules/social-accounts/ && git commit -m "feat(api): SocialAccountsService.updateTokens + markNeedsReconnect" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Task 3: `PublishProcessor` — refresh before publish + log fix (TDD)

**Files:** Modify `apps/api/src/modules/scheduler/publish.processor.ts`; Test `…/publish.processor.spec.ts`

Context: `process(job)` finds the `ACTIVE` account per variant and calls `connectors.get(platform).publish({account, variant})`. The constructor is `(prisma, connectors)`. We add `SocialAccountsService` as a 3rd constructor arg, refresh the token if expired before publishing, and harden the failure log.

- [ ] **Step 1: Failing test** (`publish.processor.spec.ts`) — test the extracted `ensureUsableAccount` directly:
```ts
import { PublishProcessor } from './publish.processor';

describe('PublishProcessor.ensureUsableAccount', () => {
  function setup() {
    const updateTokens = jest.fn().mockResolvedValue({ id: 'a1', accessToken: 'fresh' });
    const accounts = { updateTokens, markNeedsReconnect: jest.fn() } as any;
    const proc = new PublishProcessor({} as any, {} as any, accounts);
    return { updateTokens, accounts, proc };
  }
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 3_600_000);

  it('refreshes + persists when the token is expired and the connector supports refresh', async () => {
    const { updateTokens, proc } = setup();
    const connector = { refreshToken: jest.fn().mockResolvedValue({ accessToken: 'fresh', refreshToken: 'rt', expiresAt: future }) } as any;
    const account = { id: 'a1', accessToken: 'stale', refreshToken: 'rt', tokenExpiresAt: past } as any;
    const out = await proc.ensureUsableAccount(account, connector);
    expect(connector.refreshToken).toHaveBeenCalledWith('rt');
    expect(updateTokens).toHaveBeenCalledWith('a1', { accessToken: 'fresh', tokenExpiresAt: future, refreshToken: 'rt' });
    expect(out.accessToken).toBe('fresh');
  });
  it('does not refresh when the token is still valid', async () => {
    const { proc } = setup();
    const connector = { refreshToken: jest.fn() } as any;
    await proc.ensureUsableAccount({ id: 'a1', refreshToken: 'rt', tokenExpiresAt: future } as any, connector);
    expect(connector.refreshToken).not.toHaveBeenCalled();
  });
  it('does not refresh when the connector has no refreshToken method', async () => {
    const { proc } = setup();
    const account = { id: 'a1', refreshToken: 'rt', tokenExpiresAt: past } as any;
    const out = await proc.ensureUsableAccount(account, {} as any);
    expect(out).toBe(account);
  });
});
```
- [ ] **Step 2: Run, FAIL:** `pnpm --filter @inboudly/api test -- publish.processor` → `ensureUsableAccount` missing.
- [ ] **Step 3: Implement** in `publish.processor.ts`:
  - Import + inject `SocialAccountsService` (constructor 3rd arg `private accounts: SocialAccountsService`).
  - Add the method:
```ts
  /** Refresh an expiring access token before publishing. Returns a usable account.
   *  Throws (caller marks the account NEEDS_RECONNECT) only if a needed refresh fails. */
  async ensureUsableAccount(account: any, connector: { refreshToken?: (rt: string) => Promise<any> }): Promise<any> {
    const SKEW_MS = 60_000;
    const expired = account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + SKEW_MS;
    if (!expired || !connector.refreshToken || !account.refreshToken) return account;
    const fresh = await connector.refreshToken(account.refreshToken);
    return this.accounts.updateTokens(account.id, {
      accessToken: fresh.accessToken,
      tokenExpiresAt: fresh.expiresAt ?? null,
      refreshToken: fresh.refreshToken,
    });
  }
```
  - In `process()`, inside the per-variant `try`, BEFORE the existing `connector.publish(...)`:
```ts
        const connector = this.connectors.get(variant.platform);
        let usable = account;
        try {
          usable = await this.ensureUsableAccount(account, connector);
        } catch {
          await this.accounts.markNeedsReconnect(account.id);
          throw new Error(`${variant.platform} access expired — reconnect in Settings to publish.`);
        }
        const result = await connector.publish({ account: usable, variant: { ...variant, media: variant.media } });
```
  (The surrounding `catch` already records a FAILED publication with the thrown message + sets `allOk = false`.)
  - **Log fix:** change `this.logger.error('Failed to publish ${variant.platform} variant', err)` to `this.logger.error(\`Failed to publish ${variant.platform} variant: ${(err as Error).message}\`)` (drop the `err` object).
- [ ] **Step 4: Run, PASS + type-check:** `pnpm --filter @inboudly/api test -- publish.processor` → 3 pass; `pnpm --filter @inboudly/api type-check` → clean.
- [ ] **Step 5: Commit:** `git add apps/api/src/modules/scheduler/ && git commit -m "feat(api): refresh expiring OAuth tokens before publishing; harden failure log" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Task 4: Frontend — `NEEDS_RECONNECT` connect-row state

**Files:** Modify `apps/web/src/app/dashboard/settings/page.tsx`

> Read the file: it has the `social-accounts` query (returns `SocialAccount[]` with `status`, `platform`, `handle`) + the connected-accounts rendering + the connect-button list (`PLATFORM_OAUTH_PATH`, `startConnect`).

- [ ] **Step 1:** Where each connected/known account is rendered, branch on `account.status`:
  - `'ACTIVE'` → existing connected display.
  - `'NEEDS_RECONNECT'` → an amber row: warning icon + name + "Access expired — reconnect to keep publishing" + a **Reconnect** button that calls the same `startConnect(platform)` (re-runs OAuth). Match the mockup `docs/token-refresh-ui-design.html` (amber, icon+text, ≥40px button). Use `lucide-react` `AlertTriangle` (or existing warning icon) + Tailwind `text-amber-600 dark:text-amber-400`.
  - Other (no account) → existing "Connect" button.
- [ ] **Step 2: Verify (type-check only — dev server may be running):** `pnpm --filter @inboudly/web type-check` → clean.
- [ ] **Step 3: Commit:** `git add apps/web/src/app/dashboard/settings/page.tsx && git commit -m "feat(web): render NEEDS_RECONNECT (reconnect-needed) account state in Settings" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

> Note: the failed-post error in Calendar/Posts already surfaces the publication `errorMessage` (now "…access expired — reconnect in Settings"). If the Calendar/Posts UI does NOT currently show publication error messages, that surfacing is a separate small follow-up — out of scope for this plan unless trivially adjacent.

---

## Task 5: Full validation

- [ ] **Step 1:** Stop any dev servers on :3000/:3002 (a production build conflicts with a running web dev server).
- [ ] **Step 2:**
```
pnpm --filter @inboudly/api test
pnpm --filter @inboudly/api type-check
pnpm --filter @inboudly/api build
pnpm --filter @inboudly/web type-check
pnpm --filter @inboudly/web build
```
Expected: all green (new `social-accounts.service` + `publish.processor` specs pass; both apps build).

---

## Self-Review
**Spec coverage:** NEEDS_RECONNECT enum (T1) ✓; updateTokens + markNeedsReconnect (T2) ✓; refresh-before-publish + failure→markNeedsReconnect + log fix (T3) ✓; connect-row state (T4) ✓; validation (T5) ✓. The failed-post error copy comes from T3's thrown message; surfacing in Calendar/Posts noted as conditional.
**Placeholder scan:** complete code in T1–T3; T4 references the mockup + says read-the-file (the exact connected-row markup isn't quoted) but specifies the exact state + copy + behavior.
**Type consistency:** `AccountStatus.NEEDS_RECONNECT` consistent across schema/service/web. `updateTokens(id, {accessToken, tokenExpiresAt, refreshToken?})` signature matches its use in `ensureUsableAccount`. `ensureUsableAccount(account, connector)` consistent (test + impl + call site). Connector `refreshToken(rt)` + its `{accessToken, refreshToken, expiresAt}` return match the `IPlatformConnector` / `OauthTokenSet` shape.
