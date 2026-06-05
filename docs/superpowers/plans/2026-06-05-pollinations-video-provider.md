# Real Video via Pollinations (BYOK) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, prompt-driven `PollinationsVideoProvider` (BYOK key) behind the existing `VideoProvider` seam, keeping Demo as the always-works fallback, plus a stale-job safety net for the in-process runner.

**Architecture:** Pollinations video is a **synchronous** `GET https://gen.pollinations.ai/video/{prompt}` returning MP4 bytes (verified against their docs) — so the adapter mirrors `PollinationsImageService`: fetch bytes → persist to R2 → register a VIDEO `MediaAsset`. A new encrypted `pollinationsKey` makes Pollinations a keyed provider in the existing resolver; the detached `run()` is unchanged, with a `@Cron` reaper failing jobs stuck in GENERATING.

**Tech Stack:** NestJS 10, Prisma 5 (`db push`), `@nestjs/schedule` (`@Cron`), R2 via `R2StorageService`, jest+ts-jest, Next.js settings UI.

**Spec:** `docs/superpowers/specs/2026-06-05-pollinations-video-provider-design.md`

**Verified Pollinations video API:** `GET https://gen.pollinations.ai/video/{encodeURIComponent(prompt)}` · auth `Authorization: Bearer <key>` (or `?key=`) · params `model` (required), `width`/`height`, `duration` (model-specific ranges), `aspectRatio` (`16:9`/`9:16`), `seed`, `image` · returns **synchronous `video/mp4` binary**. Models: `seedance` (2–10s), `veo` (4/6/8s), `wan`/`wan-fast` (2–15s), etc. Billed via account pollen balance.

---

## File Structure

- **Modify** `packages/database/prisma/schema.prisma` — add `pollinationsKey` to `WorkspaceAiCredentials`.
- **Modify** `apps/api/src/modules/ai-credentials/ai-credentials.service.ts` — keyed Pollinations (types, resolver, IMPLEMENTED list, view).
- **Modify** `apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts` — pollinations now keyed.
- **Modify** `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts` — allow `pollinationsKey`.
- **Create** `apps/api/src/modules/ai/video/pollinations-video.provider.ts` + `.spec.ts`.
- **Modify** `apps/api/src/modules/ai/video/video-generation.service.ts` — dispatch + `@Cron` reaper.
- **Modify** `apps/api/src/modules/ai/video/video-generation.service.spec.ts` (new) — reaper unit test (or co-locate).
- **Modify** `apps/api/src/modules/ai/ai.module.ts` — register provider.
- **Modify** `apps/api/src/app.module.ts` — ensure `ScheduleModule.forRoot()` (only if absent).
- **Modify** Settings: the AI-integrations key cards (add a Pollinations card) + `apps/web/src/app/dashboard/settings/ai-defaults-card.tsx` (enable + gate the Pollinations video option).

---

## Task 1: Prisma — add `pollinationsKey`

**Files:** Modify `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add the field**

In `model WorkspaceAiCredentials`, after the existing `klingKey String? @db.Text` line, add:
```prisma
  pollinationsKey String? @db.Text
```

- [ ] **Step 2: Push + regenerate**

Run: `pnpm --filter @inboudly/database db:push && pnpm --filter @inboudly/database db:generate`
Expected: "in sync", client regenerated, no data-loss prompt (additive optional column).

- [ ] **Step 3: Commit**
```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): add pollinationsKey to WorkspaceAiCredentials" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: AiCredentialsService — keyed Pollinations (TDD)

**Files:**
- Modify: `apps/api/src/modules/ai-credentials/ai-credentials.service.ts`
- Test: `apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append these cases inside the existing `describe('AiCredentialsService.resolveVideoProvider', …)` block in `resolve-video-provider.spec.ts`:
```ts
  it('resolves pollinations when a pollinationsKey is present', async () => {
    const svc = makeService({ preferredVideoProvider: 'pollinations', keys: { pollinationsKey: 'sk_live_x' } });
    const r = await svc.resolveVideoProvider('ws1');
    expect(r.provider).toBe('pollinations');
    expect(r.apiKey).toBe('sk_live_x');
  });

  it('falls back to demo when pollinations is preferred but no key is saved', async () => {
    const svc = makeService({ preferredVideoProvider: 'pollinations' });
    expect((await svc.resolveVideoProvider('ws1')).provider).toBe('demo');
  });
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @inboudly/api test -- resolve-video-provider`
Expected: FAIL — pollinations currently resolves keyless (returns 'pollinations' even with no key) and isn't in IMPLEMENTED, so both new assertions fail.

- [ ] **Step 3: Implement the service changes**

In `ai-credentials.service.ts`:

(a) `AiProviderKeyName` union — add `'pollinationsKey'`:
```ts
export type AiProviderKeyName =
  | 'geminiKey' | 'openaiKey' | 'anthropicKey'
  | 'runwayKey' | 'klingKey' | 'pollinationsKey'
  | 'elevenLabsKey' | 'sunoKey' | 'pineconeKey';
```

(b) `KEY_FIELDS` array — add `'pollinationsKey'`.

(c) `IMPLEMENTED_VIDEO_PROVIDERS` — add pollinations:
```ts
export const IMPLEMENTED_VIDEO_PROVIDERS: VideoProviderName[] = ['demo', 'pollinations'];
```

(d) In `resolveVideoProvider`, change the `keyFieldFor` map + the keyless branch so ONLY demo is keyless:
```ts
    const keyFieldFor: Partial<Record<VideoProviderName, AiProviderKeyName>> = {
      pollinations: 'pollinationsKey',
      runway: 'runwayKey',
      kling: 'klingKey',
      veo: 'geminiKey',
    };
    // ...
    if (preferred && IMPLEMENTED_VIDEO_PROVIDERS.includes(preferred)) {
      if (preferred === 'demo') return pick(preferred, '');
      const keyField = keyFieldFor[preferred];
      const key = keyField ? await this.getDecryptedKey(workspaceId, keyField) : null;
      if (key) return pick(preferred, key);
    }
    return pick('demo', '');
```
(Remove the old `preferred === 'demo' || preferred === 'pollinations'` keyless line and its comment.)

(e) `AiCredentialsView` interface — add a pollinations provider state (key-only, no model field needed here):
```ts
  pollinations: { configured: boolean; masked: string | null };
```
Place it next to `runway`/`kling`.

(f) `view()` return — add:
```ts
      pollinations: safeKey('pollinationsKey'),
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @inboudly/api test -- resolve-video-provider`
Expected: PASS (existing tests + 2 new). Then `pnpm --filter @inboudly/api type-check` → clean.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/ai-credentials/ai-credentials.service.ts apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts
git commit -m "feat(api): make Pollinations a keyed, implemented video provider" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Allow `pollinationsKey` in the credentials controller

**Files:** Modify `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts`

- [ ] **Step 1: Add to `ALLOWED_KEY_FIELDS`**

Add `'pollinationsKey'` to the `ALLOWED_KEY_FIELDS: AiProviderKeyName[]` array (alongside `runwayKey`, `klingKey`).

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @inboudly/api type-check` → clean (the type already includes it from Task 2).

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/modules/ai-credentials/ai-credentials.controller.ts
git commit -m "feat(api): allow saving pollinationsKey" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `PollinationsVideoProvider` (TDD)

**Files:**
- Create: `apps/api/src/modules/ai/video/pollinations-video.provider.ts`
- Test: `apps/api/src/modules/ai/video/pollinations-video.provider.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `pollinations-video.provider.spec.ts`:
```ts
import { PollinationsVideoProvider } from './pollinations-video.provider';

describe('PollinationsVideoProvider', () => {
  const realFetch = (global as any).fetch;
  afterEach(() => { (global as any).fetch = realFetch; });

  function setup() {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0, 0, 0, 1]).buffer),
    });
    (global as any).fetch = fetchMock;
    const r2 = { putObject: jest.fn().mockResolvedValue('https://r2.example/v/x.mp4') } as any;
    const media = { register: jest.fn().mockResolvedValue({ id: 'media_1', url: 'https://r2.example/v/x.mp4' }) } as any;
    return { fetchMock, r2, media, provider: new PollinationsVideoProvider(media, r2) };
  }

  it('GETs gen.pollinations.ai with a bearer key, persists to R2, registers a VIDEO asset', async () => {
    const { fetchMock, r2, media, provider } = setup();
    const result = await provider.generate('sk_test', {
      workspaceId: 'ws1', prompt: 'a cat surfing', durationSec: 5, aspectRatio: '9:16', model: 'seedance',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://gen.pollinations.ai/video/');
    expect(url).toContain('model=seedance');
    expect(url).toContain('duration=5');
    expect(url).toContain('aspectRatio=9%3A16');
    expect(init.headers.Authorization).toBe('Bearer sk_test');
    expect(r2.putObject).toHaveBeenCalledTimes(1);
    const reg = media.register.mock.calls[0][0];
    expect(reg.type).toBe('VIDEO');
    expect(reg.source).toBe('AI_GENERATED');
    expect(reg.aiModel).toBe('seedance');
    expect(reg.aiPrompt).toBe('a cat surfing');
    expect(result).toEqual({ asset: { id: 'media_1', url: 'https://r2.example/v/x.mp4' }, model: 'seedance' });
    expect(provider.name).toBe('pollinations');
  });

  it('clamps veo duration to the nearest of 4/6/8', async () => {
    const { fetchMock, provider } = setup();
    await provider.generate('k', { workspaceId: 'w', prompt: 'x', durationSec: 5, aspectRatio: '16:9', model: 'veo' });
    expect(fetchMock.mock.calls[0][0]).toContain('duration=4');
  });

  it('throws a useful error on a non-OK response', async () => {
    const { provider } = setup();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 402, text: () => Promise.resolve('no credit') });
    await expect(
      provider.generate('k', { workspaceId: 'w', prompt: 'x', durationSec: 5, aspectRatio: '1:1', model: 'seedance' }),
    ).rejects.toThrow(/402/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @inboudly/api test -- pollinations-video.provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `pollinations-video.provider.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const BASE_URL = 'https://gen.pollinations.ai/video';
// Models that only accept a fixed set of durations — clamp to the nearest.
const FIXED_DURATIONS: Record<string, number[]> = { veo: [4, 6, 8] };

/**
 * Pollinations text-to-video (BYOK). GET gen.pollinations.ai/video/{prompt} with a
 * Bearer key returns the MP4 bytes synchronously; we persist to R2 and register a
 * VIDEO MediaAsset. Billed against the workspace's Pollinations pollen balance.
 */
@Injectable()
export class PollinationsVideoProvider implements VideoProvider {
  readonly name = 'pollinations';
  private readonly logger = new Logger(PollinationsVideoProvider.name);

  constructor(private media: MediaService, private r2: R2StorageService) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    const model = params.model?.trim() || 'seedance';
    const duration = this.clampDuration(model, params.durationSec);

    const qs = new URLSearchParams({ model, duration: String(duration) });
    if (params.aspectRatio === '9:16' || params.aspectRatio === '16:9') {
      qs.set('aspectRatio', params.aspectRatio);
    } else {
      qs.set('width', '1024');
      qs.set('height', '1024');
    }
    if (params.referenceImageUrl) qs.set('image', params.referenceImageUrl);

    const url = `${BASE_URL}/${encodeURIComponent(params.prompt)}?${qs.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Pollinations video ${res.status}: ${String(detail).slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const r2Url = await this.r2.putObject(`videos/pollinations/${randomUUID()}.mp4`, buf, 'video/mp4');

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: r2Url,
      filename: `pollinations-${model}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: buf.length,
      durationSec: duration,
      aiPrompt: params.prompt,
      aiModel: model,
    });
    this.logger.log(`Pollinations video generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model };
  }

  /** Snap a requested duration to the nearest value a model allows (ties → lower). */
  private clampDuration(model: string, requested: number): number {
    const allowed = FIXED_DURATIONS[model];
    if (!allowed) return requested;
    return allowed.reduce(
      (best, n) => (Math.abs(n - requested) < Math.abs(best - requested) ? n : best),
      allowed[0],
    );
  }
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @inboudly/api test -- pollinations-video.provider`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/ai/video/pollinations-video.provider.ts apps/api/src/modules/ai/video/pollinations-video.provider.spec.ts
git commit -m "feat(api): PollinationsVideoProvider (text-to-video, BYOK, R2-persisted)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Dispatch + module wiring

**Files:**
- Modify: `apps/api/src/modules/ai/video/video-generation.service.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Inject + dispatch**

In `video-generation.service.ts`: add `PollinationsVideoProvider` to the constructor (`private pollinations: PollinationsVideoProvider`) and a case in `adapterFor`:
```ts
  private adapterFor(provider: string): VideoProvider {
    switch (provider) {
      case 'demo':
        return this.demo;
      case 'pollinations':
        return this.pollinations;
      default:
        this.logger.warn(`Unknown video provider "${provider}", falling back to demo`);
        return this.demo;
    }
  }
```
Add the import: `import { PollinationsVideoProvider } from './pollinations-video.provider';`

- [ ] **Step 2: Register in AiModule**

In `ai.module.ts`, add `PollinationsVideoProvider` to `providers` (import it; `MediaModule` already provides `MediaService` + `R2StorageService`).

- [ ] **Step 3: Build + boot smoke**

Run: `pnpm --filter @inboudly/api build` → PASS.
Then boot-smoke (confirms DI resolves the new provider + R2):
```bash
cd "C:/Users/Im_tHe_rEaL_LiM/source/repos/Inboudly"
timeout 35 pnpm --filter @inboudly/api start > /tmp/api-boot.log 2>&1 &
sleep 30
grep -iE "successfully started|Nest can't resolve|UnknownDependencies|ERROR" /tmp/api-boot.log | head
pkill -f "node dist/main" 2>/dev/null; true
```
Expected: "Nest application successfully started", no DI error.

- [ ] **Step 4: Commit**
```bash
git add apps/api/src/modules/ai/video/video-generation.service.ts apps/api/src/modules/ai/ai.module.ts
git commit -m "feat(api): dispatch pollinations video provider + register in AiModule" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Stale-job reaper (`@Cron`)

**Files:**
- Modify: `apps/api/src/modules/ai/video/video-generation.service.ts`
- Test: `apps/api/src/modules/ai/video/video-generation.reaper.spec.ts`
- Modify (only if needed): `apps/api/src/app.module.ts`

- [ ] **Step 1: Confirm ScheduleModule is registered**

Check `apps/api/src/app.module.ts` for `ScheduleModule.forRoot()`. If absent, add `import { ScheduleModule } from '@nestjs/schedule';` and put `ScheduleModule.forRoot()` in the `imports` array. (If another module already calls it, do nothing.)

- [ ] **Step 2: Write the failing test**

Create `video-generation.reaper.spec.ts`:
```ts
import { VideoGenerationService } from './video-generation.service';
import { VideoStatus } from '@inboudly/database';

describe('VideoGenerationService.reapStaleJobs', () => {
  it('fails GENERATING jobs older than the cutoff', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { videoGeneration: { updateMany } } as any;
    const svc = new VideoGenerationService(prisma, {} as any, {} as any, {} as any);
    await svc.reapStaleJobs();
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe(VideoStatus.GENERATING);
    expect(arg.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(arg.data.status).toBe(VideoStatus.FAILED);
  });
});
```
> Note the constructor now takes 4 args: `(prisma, credentials, demo, pollinations)`. Pass `{} as any` for the unused ones.

- [ ] **Step 3: Run, verify FAIL**

Run: `pnpm --filter @inboudly/api test -- video-generation.reaper`
Expected: FAIL — `reapStaleJobs` is not a function.

- [ ] **Step 4: Implement**

In `video-generation.service.ts`, add the import `import { Cron } from '@nestjs/schedule';` and a method:
```ts
  private static readonly STALE_MS = 10 * 60 * 1000;

  /** Safety net for the in-process runner: a server restart (or a hung provider)
   *  can orphan a GENERATING job. Fail anything stuck past STALE_MS. */
  @Cron('*/2 * * * *')
  async reapStaleJobs(): Promise<void> {
    const cutoff = new Date(Date.now() - VideoGenerationService.STALE_MS);
    const res = await this.prisma.videoGeneration.updateMany({
      where: { status: VideoStatus.GENERATING, updatedAt: { lt: cutoff } },
      data: { status: VideoStatus.FAILED, errorMessage: 'Generation timed out. Please try again.' },
    });
    if (res.count > 0) this.logger.warn(`Reaped ${res.count} stale video job(s)`);
  }
```

- [ ] **Step 5: Run, verify PASS + type-check**

Run: `pnpm --filter @inboudly/api test -- video-generation.reaper` → PASS.
Run: `pnpm --filter @inboudly/api type-check` → clean.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/modules/ai/video/video-generation.service.ts apps/api/src/modules/ai/video/video-generation.reaper.spec.ts apps/api/src/app.module.ts
git commit -m "feat(api): reap stale GENERATING video jobs via cron" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Settings UI — Pollinations key card + enable the provider

**Files:**
- Modify: the AI-integrations key-cards component on the settings page (locate it).
- Modify: `apps/web/src/app/dashboard/settings/ai-defaults-card.tsx`

- [ ] **Step 1: Add a Pollinations BYOK key card**

Open `apps/web/src/app/dashboard/settings/page.tsx` and find the component that renders the provider key cards ("AI integrations" — Anthropic/Google/OpenAI). Duplicate the **OpenAI** key card and adapt it for Pollinations: title "Pollinations", `field = 'pollinationsKey'` (the PUT/DELETE go to `/workspaces/:id/ai-credentials/pollinationsKey`, already allowed by Task 3), placeholder `sk_...`, helper text "Get a key + add credit at pollinations.ai", and read its configured/masked state from the credentials `view()` `pollinations` field (added in Task 2). Keep the same Save/Clear behavior the other cards use. (Mirror the existing card exactly — do not invent new API calls.)

- [ ] **Step 2: Enable + gate the Pollinations video option in `ai-defaults-card.tsx`**

(a) In `CredsView`, add:
```tsx
  pollinations: { configured: boolean } | null;
```
(b) Flip readiness:
```tsx
const VIDEO_PROVIDER_READY: Record<string, boolean> = {
  demo: true, pollinations: true, runway: false, kling: false, veo: false,
};
```
(c) Replace `POLLINATIONS_VIDEO_MODELS` with the real models:
```tsx
const POLLINATIONS_VIDEO_MODELS: ModelOption[] = [
  { value: 'seedance', label: 'seedance — 2–10s (default)' },
  { value: 'veo',      label: 'veo — 4/6/8s' },
  { value: 'wan-fast', label: 'wan-fast — 2–15s' },
];
```
(d) Gate the Pollinations `<option>` on a saved key (so picking it actually resolves to Pollinations, not the Demo fallback). In the provider `<select>`, change the Pollinations option to:
```tsx
<option value="pollinations" disabled={!data.pollinations?.configured}>
  Pollinations{!data.pollinations?.configured ? ' — add key first' : ' — Seedance/Veo/Wan'}
</option>
```
(e) Update the footer note:
```tsx
<p className="mt-2 text-xs text-muted-foreground">
  <strong>Demo</strong> (free, fixed sample) and <strong>Pollinations</strong> (your key, real prompt-driven) are active. Runway, Kling and Veo arrive in upcoming updates.
</p>
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS (retry once if a post-cache-clear first build flakes with no real error).

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/app/dashboard/settings/
git commit -m "feat(web): Pollinations video key card + enable provider in AI defaults" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Verify the live API + full validation

**Files:** none (verification only)

- [ ] **Step 1: Verify the live Pollinations video endpoint (with a real key + credit)**

Confirm the documented contract against reality (docs lag). With a Pollinations key (`sk_…`) that has pollen credit:
```bash
curl -sS -o /tmp/poll.mp4 -w "HTTP %{http_code} type=%{content_type} %{size_download}B\n" \
  -H "Authorization: Bearer <YOUR_KEY>" \
  "https://gen.pollinations.ai/video/a%20cat%20surfing?model=seedance&duration=5&aspectRatio=9:16"
```
Expected: HTTP 200, `content_type` `video/mp4`, size > 0. If the URL shape/auth/response differs, **adjust `PollinationsVideoProvider.generate()` accordingly** (it's isolated to that method) and re-run its unit test.

- [ ] **Step 2: Full automated suite + builds**

Run:
```
pnpm --filter @inboudly/api test
pnpm --filter @inboudly/api type-check
pnpm --filter @inboudly/api build
pnpm --filter @inboudly/web build
```
Expected: all green (schema + resolver + demo + pollinations + reaper specs pass).

- [ ] **Step 3: Manual end-to-end**

Servers running, signed in, **Pollinations key saved in Settings**:
1. Settings → Video → select **Pollinations** (enabled now) + a model.
2. Composer → Video → prompt → Generate → job GENERATING → after the real generation, a **prompt-relevant** clip appears (not the sample), playable in Composer/tray/Media.
3. Remove the key → provider falls back to **Demo** (sample clip) with no error.

- [ ] **Step 4: Final commit (if tweaks from Step 1)**
```bash
git add -A && git commit -m "fix(api): align PollinationsVideoProvider with live API" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** `pollinationsKey` field (Task 1) ✓; keyed resolver + IMPLEMENTED + view (Task 2) ✓; controller allow-list (Task 3) ✓; adapter fetch→R2→register with the verified sync-MP4 contract (Task 4) ✓; dispatch + module (Task 5) ✓; in-process runner kept + stale-job reaper (Task 6) ✓; Settings key card + enable/gate + real models (Task 7) ✓; live-API verification as the explicit risk task (Task 8) ✓; Demo fallback preserved throughout (resolver returns demo when no key) ✓.

**Placeholder scan:** None — complete code in every code step. Task 1/3/5/7 reference exact anchors; Task 7's key card says "mirror the existing OpenAI card" because that component wasn't quoted here — the engineer reads it first (the API contract it uses is fully specified).

**Type consistency:** `pollinationsKey` consistent across Prisma, `AiProviderKeyName`, `KEY_FIELDS`, `keyFieldFor`, `ALLOWED_KEY_FIELDS`, and `view()`. `PollinationsVideoProvider` constructor `(media, r2)` matches its registration (MediaModule provides both) and the spec test. `VideoGenerationService` constructor becomes `(prisma, credentials, demo, pollinations)` — used consistently in `adapterFor`, the reaper test, and Task 5 injection. `reapStaleJobs` name consistent (Task 6 test + impl). Models (`seedance`/`veo`/`wan-fast`) consistent between the adapter default/clamp and the Settings options.
