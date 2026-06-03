# AI Video Generation — Backbone + Demo Provider (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the end-to-end async video-generation pipeline — DB job model, provider abstraction, a zero-setup **Demo** provider, REST endpoints, a Composer Image/Video toggle, a global Generations tray, and Media-library in-flight tiles — so users can generate a video and watch it go GENERATING → READY without any API key or external service.

**Architecture:** A new `VideoGeneration` Prisma row tracks each job (reusing the existing `VideoStatus` enum). `POST /ai/video` creates the row as `GENERATING`, kicks off a **detached** (un-awaited) in-process runner, and returns immediately; the frontend polls `GET /ai/video/:id`. A `VideoProvider` interface lets us swap engines; Plan 1 implements only `DemoVideoProvider`, which waits a short delay then registers a bundled sample clip (`/demo/sample-clip.mp4`) as an AI-generated `MediaAsset`. `AiCredentialsService` gains `resolveVideoProvider` (mirrors the existing image resolver: honour `preferredVideoProvider`, fall back to the always-available Demo). All five user-facing providers (Demo, Pollinations, Runway, Kling, Veo) exist in the schema/UI for forward-compat; only Demo is wired to an adapter in this plan — Runway/Kling/Veo/Pollinations adapters arrive in Plans 2 and 3.

**Tech Stack:** NestJS 10 (`apps/api`), Next.js 15 App Router + Tailwind + shadcn/ui (`apps/web`), Prisma (`packages/database`, `prisma db push` — no migrations folder), zod (`packages/shared`), TanStack Query, sonner toasts, Lucide icons, Jest + ts-jest for the new unit tests.

---

## Testing Reality (read before starting)

`apps/api` has **zero `.spec.ts` files** today and **no jest unit config** (only `test:e2e` → `./test/jest-e2e.json`). The `"test": "jest"` script currently finds nothing. Task 1 bootstraps a minimal unit config so the high-value pure-logic tests in this plan are real and runnable. We apply TDD only where it is cheap and valuable — pure backend logic: the shared schema, the provider resolver, and the Demo provider. UI and integration wiring are validated with `tsc --noEmit`, `nest build`, and the manual steps in `docs/phase2-testing-guide.html`.

## File Structure

**Create (backend):**
- `apps/api/jest.config.js` — minimal jest unit config (ts-jest, path aliases).
- `apps/api/src/modules/ai/video/video-provider.interface.ts` — `VideoProvider` interface + param/result types.
- `apps/api/src/modules/ai/video/demo-video.provider.ts` — `DemoVideoProvider` (always-works sample clip).
- `apps/api/src/modules/ai/video/demo-video.provider.spec.ts` — unit test for the Demo provider.
- `apps/api/src/modules/ai/video/video-generation.service.ts` — job creation + detached runner + poll reads.
- `apps/api/src/modules/ai/video/video-generation.controller.ts` — `POST /ai/video`, `GET /ai/video/:id`, `GET /ai/video`.
- `apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts` — unit test for resolver precedence.
- `packages/shared/src/generate-video-schema.spec.ts` — unit test for the extended schema (lives next to source for ts-jest discovery via mapper; see Task 1 note).

**Modify (backend):**
- `packages/database/prisma/schema.prisma` — add `VideoGeneration` model; add video fields to `WorkspaceAiCredentials`; add reverse relations on `Workspace` and `MediaAsset`.
- `packages/shared/src/schemas.ts` — extend `GenerateVideoSchema` (provider field, `'demo'`/wider model, `VideoProviderSchema`).
- `apps/api/src/modules/ai-credentials/ai-credentials.service.ts` — `resolveVideoProvider`/`requireVideoProvider`/`getVideoModel`/types/defaults + `view()`/`setPreferences` video fields + `AiProviderModelName` additions.
- `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts` — add video model fields to `ALLOWED_MODEL_FIELDS`; add `preferredVideoProvider` to the preferences body.
- `apps/api/src/modules/ai/ai.module.ts` — register `VideoGenerationController`, `DemoVideoProvider`, `VideoGenerationService`.

**Create (frontend):**
- `apps/web/public/demo/sample-clip.mp4` — bundled sample clip the Demo provider points at.
- `apps/web/src/components/generations-tray.tsx` — global client island polling recent video jobs.

**Modify (frontend):**
- `apps/web/src/app/dashboard/composer/page.tsx` — Image/Video segmented toggle + video controls + polling + attach.
- `apps/web/src/app/dashboard/settings/ai-defaults-card.tsx` — a Video block (provider + model; Demo active, others "coming soon").
- `apps/web/src/app/dashboard/layout.tsx` — render `<GenerationsTray />` island.
- `apps/web/src/app/dashboard/media/page.tsx` — in-flight rendering placeholder tiles.

---

## Task 1: Bootstrap the API jest unit config

**Files:**
- Create: `apps/api/jest.config.js`

- [ ] **Step 1: Create the jest config**

The mapper points `@inboudly/shared` and `@inboudly/database` at their `src` so tests see the latest schema without a rebuild. `isolatedModules: true` skips full type-checking for speed (type safety is covered by the separate `type-check` step). Decorator metadata comes from `apps/api/tsconfig.json`.

```js
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/../../packages/shared/src/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@inboudly/shared$': '<rootDir>/../../packages/shared/src',
    '^@inboudly/database$': '<rootDir>/../../packages/database/src',
  },
};
```

- [ ] **Step 2: Verify jest starts and finds zero tests (clean baseline)**

Run: `pnpm --filter @inboudly/api test`
Expected: Jest runs and reports `No tests found` (exit 1 is fine here — we add tests next). It must NOT error on config parsing.

- [ ] **Step 3: Commit**

```bash
git add apps/api/jest.config.js
git commit -m "test: bootstrap jest unit config for apps/api"
```

---

## Task 2: Extend the Prisma schema (VideoGeneration + credentials fields)

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add video fields to `WorkspaceAiCredentials`**

In `model WorkspaceAiCredentials`, immediately after the line `pollinationsModel String? // Pollinations IMAGE model (free, keyless)` (currently line 137), add:

```prisma
  // VIDEO model overrides (Plan 1+). Demo has no override (it's a fixed clip).
  pollinationsVideoModel String? // Pollinations text-to-video model
  runwayModel            String? // Runway video model (e.g. runway-gen3)
  klingModel             String? // Kling video model (e.g. kling-v2)
  veoVideoModel          String? // Google Veo video model (uses the Gemini/Google key)
```

Then, immediately after the line `preferredImageProvider String?  // 'openai' | 'gemini' | 'pollinations'` (currently line 141), add:

```prisma
  preferredVideoProvider String?  // 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo'
```

- [ ] **Step 2: Add the reverse relation to `Workspace`**

In `model Workspace`, after the line `videoProjects     VideoProject[]` (currently line 102), add:

```prisma
  videoGenerations  VideoGeneration[]
```

- [ ] **Step 3: Add the reverse relation to `MediaAsset`**

In `model MediaAsset`, after the line `postMedia     PostMedia[]` (currently line 311), add:

```prisma
  videoGenerations VideoGeneration[]
```

- [ ] **Step 4: Add the `VideoGeneration` model**

Immediately after the closing brace of `model MediaAsset` (currently line 316) and before the `// POSTS, VARIANTS, PUBLICATIONS` comment block, add:

```prisma
/// One async video-generation job. Created as GENERATING, flipped to READY
/// (with mediaAssetId) or FAILED (with errorMessage) by the detached runner.
/// Frontend polls GET /ai/video/:id until it leaves GENERATING.
model VideoGeneration {
  id                String      @id @default(cuid())
  workspaceId       String
  prompt            String      @db.Text
  provider          String      // 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo'
  model             String
  aspectRatio       String      // '9:16' | '16:9' | '1:1'
  durationSec       Int
  referenceImageUrl String?
  status            VideoStatus @default(PENDING)
  mediaAssetId      String?
  errorMessage      String?     @db.Text
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  workspace         Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  mediaAsset        MediaAsset? @relation(fields: [mediaAssetId], references: [id])

  @@index([workspaceId, status])
  @@index([workspaceId, createdAt])
}
```

- [ ] **Step 5: Push the schema and regenerate the client**

Run: `pnpm --filter @inboudly/database db:push && pnpm --filter @inboudly/database db:generate`
Expected: Prisma reports the schema is in sync and the client is regenerated, with no validation errors.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): add VideoGeneration model and per-provider video credential fields"
```

---

## Task 3: Extend the shared `GenerateVideoSchema`

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/generate-video-schema.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/generate-video-schema.spec.ts`:

```ts
import { GenerateVideoSchema, VideoProviderSchema } from './schemas';

const WS = 'clxxxxxxxxxxxxxxxxxxxxxxx0'; // 25-char cuid-shaped id

describe('GenerateVideoSchema', () => {
  it('applies defaults when only workspaceId + prompt are given', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'a cat surfing' });
    expect(out.durationSec).toBe(5);
    expect(out.aspectRatio).toBe('9:16');
    expect(out.provider).toBeUndefined(); // omitted → server resolves
    expect(out.model).toBeUndefined();
  });

  it('accepts demo as a provider', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', provider: 'demo' });
    expect(out.provider).toBe('demo');
  });

  it('accepts an arbitrary model string', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', model: 'runway-gen3' });
    expect(out.model).toBe('runway-gen3');
  });

  it('rejects an unknown provider', () => {
    expect(() => GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', provider: 'sora' }))
      .toThrow();
  });

  it('VideoProviderSchema enumerates all five providers', () => {
    expect(VideoProviderSchema.options).toEqual(['demo', 'pollinations', 'runway', 'kling', 'veo']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @inboudly/api test -- generate-video-schema`
Expected: FAIL — `VideoProviderSchema` is not exported and the current `model` enum rejects `'runway-gen3'` only via enum, etc.

- [ ] **Step 3: Replace the existing `GenerateVideoSchema` block**

In `packages/shared/src/schemas.ts`, replace the current block (lines 101–109):

```ts
export const GenerateVideoSchema = z.object({
  workspaceId: z.string().cuid(),
  prompt: z.string().min(1).max(2000),
  durationSec: z.number().int().min(2).max(10).default(5),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  model: z.enum(['runway-gen3', 'kling-v2']).default('runway-gen3'),
  referenceImageUrl: z.string().url().optional(),
});
export type GenerateVideoInput = z.infer<typeof GenerateVideoSchema>;
```

with:

```ts
export const VideoProviderSchema = z.enum(['demo', 'pollinations', 'runway', 'kling', 'veo']);
export type VideoProviderName = z.infer<typeof VideoProviderSchema>;

export const GenerateVideoSchema = z.object({
  workspaceId: z.string().cuid(),
  prompt: z.string().min(1).max(2000),
  durationSec: z.number().int().min(2).max(10).default(5),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  // Omit to let the server resolve the workspace's preferred/default provider.
  provider: VideoProviderSchema.optional(),
  // Free-form so each provider's model list can grow without a schema change.
  // Omit to use the server default for the resolved provider.
  model: z.string().min(1).max(80).optional(),
  referenceImageUrl: z.string().url().optional(),
});
export type GenerateVideoInput = z.infer<typeof GenerateVideoSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @inboudly/api test -- generate-video-schema`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/generate-video-schema.spec.ts
git commit -m "feat(shared): extend GenerateVideoSchema with provider field and VideoProviderSchema"
```

---

## Task 4: Add the video provider resolver to AiCredentialsService

**Files:**
- Modify: `apps/api/src/modules/ai-credentials/ai-credentials.service.ts`
- Test: `apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts`:

```ts
import { AiCredentialsService } from './ai-credentials.service';

// Build a service with stubbed dependencies; we only exercise resolveVideoProvider,
// which reads getRecord() and getDecryptedKey().
function makeService(opts: {
  preferredVideoProvider?: string | null;
  runwayModel?: string | null;
  keys?: Record<string, string | null>;
}) {
  const record = {
    preferredVideoProvider: opts.preferredVideoProvider ?? null,
    runwayModel: opts.runwayModel ?? null,
  } as any;
  const svc = new AiCredentialsService({} as any, {} as any);
  jest.spyOn(svc, 'getRecord').mockResolvedValue(record);
  jest.spyOn(svc, 'getDecryptedKey').mockImplementation(
    async (_ws: string, field: any) => opts.keys?.[field] ?? null,
  );
  return svc;
}

describe('AiCredentialsService.resolveVideoProvider', () => {
  it('defaults to demo when nothing is configured', async () => {
    const svc = makeService({});
    const r = await svc.resolveVideoProvider('ws1');
    expect(r.provider).toBe('demo');
    expect(r.apiKey).toBe('');
    expect(r.model).toBe('demo');
  });

  it('honours preferred=demo', async () => {
    const svc = makeService({ preferredVideoProvider: 'demo' });
    expect((await svc.resolveVideoProvider('ws1')).provider).toBe('demo');
  });

  it('falls back to demo for a not-yet-implemented preferred provider (runway), even with a key', async () => {
    const svc = makeService({ preferredVideoProvider: 'runway', keys: { runwayKey: 'rk_live_xxx' } });
    // Plan 1: only demo is implemented, so resolution falls through to demo.
    expect((await svc.resolveVideoProvider('ws1')).provider).toBe('demo');
  });

  it('honours a per-request override but still falls back to demo when unimplemented', async () => {
    const svc = makeService({});
    expect((await svc.resolveVideoProvider('ws1', 'kling')).provider).toBe('demo');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @inboudly/api test -- resolve-video-provider`
Expected: FAIL — `resolveVideoProvider` does not exist on `AiCredentialsService`.

- [ ] **Step 3: Add types + defaults near the top of the service**

In `apps/api/src/modules/ai-credentials/ai-credentials.service.ts`, after the `ResolvedImageProvider` type block (ends at line 16), add:

```ts
export type VideoProviderName = 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo';

export type ResolvedVideoProvider = {
  provider: VideoProviderName;
  apiKey: string; // '' for keyless / demo
  model: string;
};
```

In the `AiProviderModelName` union (lines 28–33), add the four video model fields so the controller can validate them:

```ts
export type AiProviderModelName =
  | 'geminiModel'
  | 'geminiImageModel'
  | 'openaiModel'
  | 'anthropicModel'
  | 'pollinationsModel'
  | 'pollinationsVideoModel'
  | 'runwayModel'
  | 'klingModel'
  | 'veoVideoModel';
```

After the `DEFAULT_IMAGE_MODELS` block (ends at line 58), add:

```ts
/** Default VIDEO models when no user override is saved. */
export const DEFAULT_VIDEO_MODELS: Record<VideoProviderName, string> = {
  demo: 'demo',
  pollinations: 'pollinations-t2v',
  runway: 'runway-gen3',
  kling: 'kling-v2',
  veo: 'veo-3',
} as const;

/** Providers with a working adapter in THIS build. Plans 2/3 extend this list. */
export const IMPLEMENTED_VIDEO_PROVIDERS: VideoProviderName[] = ['demo'];
```

- [ ] **Step 4: Add the resolver methods**

In the same file, immediately after `requireImageProvider` (ends at line 223), add:

```ts
  /**
   * Video model for a provider. Demo is a fixed clip (no override field), so it
   * always returns the default. Veo uses the Google/Gemini key but its own model
   * field (veoVideoModel).
   */
  async getVideoModel(workspaceId: string, provider: VideoProviderName): Promise<string> {
    const row = await this.getRecord(workspaceId);
    const field: AiProviderModelName | null =
      provider === 'pollinations' ? 'pollinationsVideoModel'
        : provider === 'runway' ? 'runwayModel'
          : provider === 'kling' ? 'klingModel'
            : provider === 'veo' ? 'veoVideoModel'
              : null; // demo
    const custom = field ? (row?.[field] as string | null) : null;
    return custom?.trim() || DEFAULT_VIDEO_MODELS[provider];
  }

  /**
   * Video equivalent of resolveImageProvider. Demo is keyless and always
   * available, so this NEVER throws. Honours an explicit per-request override
   * first, then the saved preferredVideoProvider — but only for providers that
   * (a) have a working adapter in this build and (b) have their key when keyed.
   * Everything else falls back to the always-works Demo provider.
   */
  async resolveVideoProvider(
    workspaceId: string,
    override?: VideoProviderName,
  ): Promise<ResolvedVideoProvider> {
    const record = await this.getRecord(workspaceId);
    const preferred = (override ?? (record?.preferredVideoProvider as VideoProviderName | null))
      ?? undefined;

    const keyFieldFor: Partial<Record<VideoProviderName, AiProviderKeyName>> = {
      runway: 'runwayKey',
      kling: 'klingKey',
      veo: 'geminiKey', // Google Veo authenticates with the Gemini/Google key
    };

    const pick = async (provider: VideoProviderName, apiKey: string): Promise<ResolvedVideoProvider> => ({
      provider,
      apiKey,
      model: await this.getVideoModel(workspaceId, provider),
    });

    if (preferred && IMPLEMENTED_VIDEO_PROVIDERS.includes(preferred)) {
      if (preferred === 'demo' || preferred === 'pollinations') return pick(preferred, '');
      const keyField = keyFieldFor[preferred];
      const key = keyField ? await this.getDecryptedKey(workspaceId, keyField) : null;
      if (key) return pick(preferred, key);
    }

    // Always-works, zero-setup default.
    return pick('demo', '');
  }

  /** Alias for symmetry — Demo guarantees a provider, so this never throws. */
  async requireVideoProvider(
    workspaceId: string,
    override?: VideoProviderName,
  ): Promise<ResolvedVideoProvider> {
    return this.resolveVideoProvider(workspaceId, override);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @inboudly/api test -- resolve-video-provider`
Expected: PASS (4 tests).

- [ ] **Step 6: Surface the new fields in `view()` and `setPreferences()`**

In `AiCredentialsView` (interface, lines 66–81), after `pollinationsModel: string | null;` (line 73) add:

```ts
  pollinationsVideoModel: string | null;
  runwayModel: string | null;
  klingModel: string | null;
  veoVideoModel: string | null;
```

and after `preferredImageProvider: 'openai' | 'gemini' | 'pollinations' | null;` (line 80) add:

```ts
  preferredVideoProvider: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
```

In the `view()` return object (lines 249–262), after `pollinationsModel: (row?.pollinationsModel as string | null) ?? null,` (line 254) add:

```ts
      pollinationsVideoModel: (row?.pollinationsVideoModel as string | null) ?? null,
      runwayModel: (row?.runwayModel as string | null) ?? null,
      klingModel: (row?.klingModel as string | null) ?? null,
      veoVideoModel: (row?.veoVideoModel as string | null) ?? null,
```

and after `preferredImageProvider: (row?.preferredImageProvider as ...) ?? null,` (line 261) add:

```ts
      preferredVideoProvider:
        (row?.preferredVideoProvider as 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null) ?? null,
```

In `setPreferences` (params type, lines 302–308), add a third optional field:

```ts
  async setPreferences(
    workspaceId: string,
    prefs: {
      preferredTextProvider?: 'claude' | 'gemini' | null;
      preferredImageProvider?: 'openai' | 'gemini' | 'pollinations' | null;
      preferredVideoProvider?: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
    },
  ): Promise<void> {
```

(The body already spreads `prefs`, so no further change is needed there.)

In `clearAll` (lines 316–327), after `reset.preferredImageProvider = null;` (line 321) add:

```ts
    reset.preferredVideoProvider = null;
```

- [ ] **Step 7: Type-check the API**

Run: `pnpm --filter @inboudly/api type-check`
Expected: PASS — no type errors. (The Prisma client from Task 2 now knows the new fields.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/ai-credentials/ai-credentials.service.ts apps/api/src/modules/ai-credentials/resolve-video-provider.spec.ts
git commit -m "feat(api): add resolveVideoProvider and video model fields to AiCredentialsService"
```

---

## Task 5: VideoProvider interface + DemoVideoProvider (TDD)

**Files:**
- Create: `apps/api/src/modules/ai/video/video-provider.interface.ts`
- Create: `apps/api/src/modules/ai/video/demo-video.provider.ts`
- Test: `apps/api/src/modules/ai/video/demo-video.provider.spec.ts`

- [ ] **Step 1: Create the provider interface**

Create `apps/api/src/modules/ai/video/video-provider.interface.ts`:

```ts
export type VideoGenerateParams = {
  workspaceId: string;
  prompt: string;
  durationSec: number;
  aspectRatio: string;
  model: string;
  referenceImageUrl?: string;
};

export type VideoGenerateResult = {
  /** The registered MediaAsset (VIDEO) — at minimum its id and public url. */
  asset: { id: string; url: string };
  model: string;
};

/** A pluggable video-generation engine. Plans 2/3 add Runway/Kling/Veo/Pollinations. */
export interface VideoProvider {
  readonly name: string;
  generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult>;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/ai/video/demo-video.provider.spec.ts`:

```ts
import { DemoVideoProvider } from './demo-video.provider';

describe('DemoVideoProvider', () => {
  it('registers a VIDEO MediaAsset and returns its id + url', async () => {
    const register = jest.fn().mockResolvedValue({ id: 'media_1', url: '/demo/sample-clip.mp4' });
    const media = { register } as any;
    const provider = new DemoVideoProvider(media, 0); // 0ms delay for the test

    const result = await provider.generate('', {
      workspaceId: 'ws1',
      prompt: 'a dog skateboarding',
      durationSec: 7,
      aspectRatio: '9:16',
      model: 'demo',
    });

    expect(register).toHaveBeenCalledTimes(1);
    const arg = register.mock.calls[0][0];
    expect(arg.type).toBe('VIDEO');
    expect(arg.source).toBe('AI_GENERATED');
    expect(arg.url).toBe('/demo/sample-clip.mp4');
    expect(arg.durationSec).toBe(7);
    expect(arg.aiModel).toBe('demo');
    expect(arg.aiPrompt).toBe('a dog skateboarding');

    expect(result.asset).toEqual({ id: 'media_1', url: '/demo/sample-clip.mp4' });
    expect(result.model).toBe('demo');
    expect(provider.name).toBe('demo');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @inboudly/api test -- demo-video.provider`
Expected: FAIL — `demo-video.provider` module does not exist.

- [ ] **Step 4: Create the Demo provider**

Create `apps/api/src/modules/ai/video/demo-video.provider.ts`:

```ts
import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { MediaService } from '../../media/media.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

/** DI token for overriding the simulated latency (tests inject 0). */
export const DEMO_VIDEO_DELAY_MS = 'DEMO_VIDEO_DELAY_MS';

/** Bundled clip served by the web app from apps/web/public/demo/. */
const DEMO_CLIP_URL = '/demo/sample-clip.mp4';

/**
 * Always-works, zero-setup video provider. Waits a short delay (so the
 * GENERATING → READY UI flow is real), then registers a bundled sample clip as
 * an AI-generated VIDEO MediaAsset. No API key, no R2, no ffmpeg, no network.
 */
@Injectable()
export class DemoVideoProvider implements VideoProvider {
  readonly name = 'demo';
  private readonly logger = new Logger(DemoVideoProvider.name);

  constructor(
    private media: MediaService,
    @Optional() @Inject(DEMO_VIDEO_DELAY_MS) private readonly delayMs: number = 1200,
  ) {}

  async generate(_apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: DEMO_CLIP_URL,
      filename: 'demo-video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 0, // bundled static asset — real byte size not tracked for the demo
      durationSec: params.durationSec,
      aiPrompt: params.prompt,
      aiModel: 'demo',
    });

    this.logger.log(`Demo video generated for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model: 'demo' };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @inboudly/api test -- demo-video.provider`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/video/video-provider.interface.ts apps/api/src/modules/ai/video/demo-video.provider.ts apps/api/src/modules/ai/video/demo-video.provider.spec.ts
git commit -m "feat(api): add VideoProvider interface and always-works DemoVideoProvider"
```

---

## Task 6: VideoGenerationService (create job + detached runner + reads)

**Files:**
- Create: `apps/api/src/modules/ai/video/video-generation.service.ts`

> **Why in-process (not BullMQ) for Plan 1:** The Demo provider finishes in ~1.2s, so a detached promise is sufficient and avoids adding a queue/worker. Plans 2/3 (Runway/Kling/Veo run for minutes and survive process restarts) will migrate `run()` onto a BullMQ queue — the public method surface (`create`/`get`/`list`) stays the same.

- [ ] **Step 1: Create the service**

Create `apps/api/src/modules/ai/video/video-generation.service.ts`:

```ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AiCredentialsService } from '../../ai-credentials/ai-credentials.service';
import { DemoVideoProvider } from './demo-video.provider';
import type { VideoProvider } from './video-provider.interface';
import { VideoStatus } from '@inboudly/database';
import type { GenerateVideoInput } from '@inboudly/shared';

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
    private demo: DemoVideoProvider,
  ) {}

  /** Map a resolved provider name to its adapter. Plans 2/3 add more cases. */
  private adapterFor(provider: string): VideoProvider {
    switch (provider) {
      case 'demo':
        return this.demo;
      default:
        // resolveVideoProvider only returns implemented providers today, so this
        // is defensive — fall back to the always-works Demo provider.
        return this.demo;
    }
  }

  /**
   * Create a job, kick off the detached provider call, and return the row with
   * status GENERATING. The frontend polls GET /ai/video/:id until READY/FAILED.
   */
  async create(input: GenerateVideoInput) {
    const resolved = await this.credentials.resolveVideoProvider(input.workspaceId, input.provider);
    const model = input.model?.trim() || resolved.model;

    const job = await this.prisma.videoGeneration.create({
      data: {
        workspaceId: input.workspaceId,
        prompt: input.prompt,
        provider: resolved.provider,
        model,
        aspectRatio: input.aspectRatio,
        durationSec: input.durationSec,
        referenceImageUrl: input.referenceImageUrl ?? null,
        status: VideoStatus.GENERATING,
      },
    });

    // Detached — do NOT await. Failures are captured onto the job row in run().
    void this.run(job.id, resolved.apiKey);

    return job;
  }

  private async run(jobId: string, apiKey: string): Promise<void> {
    const job = await this.prisma.videoGeneration.findUnique({ where: { id: jobId } });
    if (!job) return;
    try {
      const adapter = this.adapterFor(job.provider);
      const result = await adapter.generate(apiKey, {
        workspaceId: job.workspaceId,
        prompt: job.prompt,
        durationSec: job.durationSec,
        aspectRatio: job.aspectRatio,
        model: job.model,
        referenceImageUrl: job.referenceImageUrl ?? undefined,
      });
      await this.prisma.videoGeneration.update({
        where: { id: jobId },
        data: { status: VideoStatus.READY, mediaAssetId: result.asset.id },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Video job ${jobId} failed: ${msg}`);
      await this.prisma.videoGeneration.update({
        where: { id: jobId },
        data: { status: VideoStatus.FAILED, errorMessage: this.friendlyError(job.provider) },
      });
    }
  }

  async get(id: string, workspaceId: string) {
    const job = await this.prisma.videoGeneration.findFirst({
      where: { id, workspaceId },
      include: { mediaAsset: true },
    });
    if (!job) throw new NotFoundException('Video generation not found');
    return job;
  }

  list(workspaceId: string) {
    return this.prisma.videoGeneration.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { mediaAsset: true },
    });
  }

  private friendlyError(provider: string): string {
    if (provider === 'demo') {
      return 'The demo video generator hit an unexpected error. Please try again.';
    }
    return `${provider} video generation isn't available yet in this build. Switch to the Demo provider in Settings → AI defaults.`;
  }
}
```

- [ ] **Step 2: Type-check (the service is not yet wired into a module, but it must compile)**

Run: `pnpm --filter @inboudly/api type-check`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/ai/video/video-generation.service.ts
git commit -m "feat(api): add VideoGenerationService with detached async runner"
```

---

## Task 7: VideoGenerationController + AiModule wiring

**Files:**
- Create: `apps/api/src/modules/ai/video/video-generation.controller.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Create the controller**

Create `apps/api/src/modules/ai/video/video-generation.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../common/auth/auth.guard';
import { GenerateVideoSchema } from '@inboudly/shared';
import { VideoGenerationService } from './video-generation.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai/video')
export class VideoGenerationController {
  constructor(private videos: VideoGenerationService) {}

  /** Start a video job. Returns the row immediately with status GENERATING. */
  @Post()
  async generate(@Body() body: unknown) {
    const input = GenerateVideoSchema.parse(body);
    return this.videos.create(input);
  }

  /** Poll a single job. */
  @Get(':id')
  async status(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.videos.get(id, workspaceId);
  }

  /** Recent jobs for the Generations tray. */
  @Get()
  async list(@Query('workspaceId') workspaceId: string) {
    return this.videos.list(workspaceId);
  }
}
```

- [ ] **Step 2: Wire everything into AiModule**

Replace the full contents of `apps/api/src/modules/ai/ai.module.ts` with:

```ts
import { Module, forwardRef } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ClaudeTextService } from './claude-text.service';
import { OpenAiImageService } from './openai-image.service';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { PollinationsImageService } from './pollinations-image.service';
import { EmbeddingsService } from './embeddings.service';
import { DemoVideoProvider } from './video/demo-video.provider';
import { VideoGenerationService } from './video/video-generation.service';
import { VideoGenerationController } from './video/video-generation.controller';
import { MediaModule } from '../media/media.module';
import { BrandModule } from '../brand/brand.module';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [MediaModule, forwardRef(() => BrandModule), AiCredentialsModule],
  controllers: [AiController, VideoGenerationController],
  providers: [
    ClaudeTextService,
    OpenAiImageService,
    GeminiTextService,
    GeminiImageService,
    PollinationsImageService,
    EmbeddingsService,
    DemoVideoProvider,
    VideoGenerationService,
  ],
  exports: [
    ClaudeTextService,
    OpenAiImageService,
    GeminiTextService,
    GeminiImageService,
    PollinationsImageService,
    EmbeddingsService,
    VideoGenerationService,
  ],
})
export class AiModule {}
```

- [ ] **Step 3: Build the API to confirm DI resolves**

Run: `pnpm --filter @inboudly/api build`
Expected: PASS — `nest build` completes with no errors. (Confirms `VideoGenerationService` can resolve `PrismaService` (global), `AiCredentialsService` (from `AiCredentialsModule`), and `DemoVideoProvider`, and that `MediaService` is available to `DemoVideoProvider` via `MediaModule`.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai/video/video-generation.controller.ts apps/api/src/modules/ai/ai.module.ts
git commit -m "feat(api): expose POST/GET /ai/video and wire video providers into AiModule"
```

---

## Task 8: Allow video model fields + preferredVideoProvider in the credentials controller

**Files:**
- Modify: `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts`

- [ ] **Step 1: Extend `ALLOWED_MODEL_FIELDS`**

Replace the `ALLOWED_MODEL_FIELDS` array (lines 35–41):

```ts
const ALLOWED_MODEL_FIELDS: AiProviderModelName[] = [
  'geminiModel',
  'geminiImageModel',
  'openaiModel',
  'anthropicModel',
  'pollinationsModel',
];
```

with:

```ts
const ALLOWED_MODEL_FIELDS: AiProviderModelName[] = [
  'geminiModel',
  'geminiImageModel',
  'openaiModel',
  'anthropicModel',
  'pollinationsModel',
  'pollinationsVideoModel',
  'runwayModel',
  'klingModel',
  'veoVideoModel',
];
```

- [ ] **Step 2: Accept `preferredVideoProvider` in the preferences body**

Replace the `setPreferences` body type (lines 117–121):

```ts
    body: {
      preferredTextProvider?: 'claude' | 'gemini' | null;
      preferredImageProvider?: 'openai' | 'gemini' | 'pollinations' | null;
    },
```

with:

```ts
    body: {
      preferredTextProvider?: 'claude' | 'gemini' | null;
      preferredImageProvider?: 'openai' | 'gemini' | 'pollinations' | null;
      preferredVideoProvider?: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
    },
```

- [ ] **Step 3: Type-check the API**

Run: `pnpm --filter @inboudly/api type-check`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai-credentials/ai-credentials.controller.ts
git commit -m "feat(api): allow video model fields and preferredVideoProvider in credentials controller"
```

---

## Task 9: Add the bundled Demo sample clip

**Files:**
- Create: `apps/web/public/demo/sample-clip.mp4`

- [ ] **Step 1: Create the demo folder and add a small sample clip**

The Demo provider returns `/demo/sample-clip.mp4`; Next.js serves `apps/web/public/` at the site root, so this resolves to `http://localhost:3000/demo/sample-clip.mp4`. Any short, royalty-free `.mp4` works. Download a small public sample (≈2 MB) from Google's public sample bucket:

```bash
mkdir -p apps/web/public/demo
curl -L -o apps/web/public/demo/sample-clip.mp4 \
  https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4
```

If the download fails or is blocked, drop ANY small `.mp4` file at exactly `apps/web/public/demo/sample-clip.mp4`.

- [ ] **Step 2: Verify the file exists and is non-empty**

Run: `ls -la apps/web/public/demo/sample-clip.mp4`
Expected: file present, size > 0 bytes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/demo/sample-clip.mp4
git commit -m "feat(web): add bundled demo video clip for the Demo provider"
```

---

## Task 10: Global Generations tray

**Files:**
- Create: `apps/web/src/components/generations-tray.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx`

- [ ] **Step 1: Create the tray client component**

Create `apps/web/src/components/generations-tray.tsx`. It is a self-contained client island: it reads the workspace id from the `me` query (same pattern Composer uses) and polls `GET /ai/video` every 2.5s while any job is GENERATING.

```tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Loader2, CheckCircle2, XCircle, X } from 'lucide-react';
import { api } from '@/lib/api-client';

interface VideoJob {
  id: string;
  prompt: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  mediaAsset: { id: string; url: string } | null;
  createdAt: string;
}

interface Me {
  memberships?: { workspace?: { id: string } }[];
}

export function GenerationsTray() {
  const [open, setOpen] = useState(false);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/users/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const jobs = useQuery({
    queryKey: ['video-jobs', workspaceId],
    queryFn: () => api.get<VideoJob[]>(`/ai/video?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    refetchInterval: (q) => {
      const data = q.state.data as VideoJob[] | undefined;
      return data?.some((j) => j.status === 'GENERATING' || j.status === 'PENDING') ? 2500 : false;
    },
  });

  const list = jobs.data ?? [];
  const active = list.filter((j) => j.status === 'GENERATING' || j.status === 'PENDING').length;

  // Nothing to show and nothing in flight → render only the button if there's history.
  if (!workspaceId || list.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-2 w-80 rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Video generations</span>
            <button onClick={() => setOpen(false)} aria-label="Close generations tray">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {list.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0">
                  {j.status === 'READY' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : j.status === 'FAILED' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{j.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.status === 'READY' ? 'Ready' : j.status === 'FAILED' ? (j.errorMessage ?? 'Failed') : 'Generating…'}
                  </p>
                </div>
                {j.status === 'READY' && j.mediaAsset && (
                  <video src={j.mediaAsset.url} className="h-10 w-10 rounded object-cover" muted />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium shadow-lg hover:bg-secondary"
      >
        {active > 0 ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Clapperboard className="h-4 w-4" />}
        {active > 0 ? `Generating ${active}…` : 'Generations'}
      </button>
    </div>
  );
}
```

> **Note:** Confirm the `me` endpoint path. Composer reads the workspace id from a `me` query — match its exact `queryKey` and `queryFn` path (e.g. `'/users/me'` or `'/auth/me'`). If Composer uses `['me']` with a different URL, copy that URL verbatim so this tray shares the cache.

- [ ] **Step 2: Render the tray in the dashboard layout**

In `apps/web/src/app/dashboard/layout.tsx`, add the import after the existing imports:

```tsx
import { GenerationsTray } from '@/components/generations-tray';
```

Then change the `<main>` element (line 59) from:

```tsx
        <main className="flex-1 overflow-y-auto">{children}</main>
```

to:

```tsx
        <main className="flex-1 overflow-y-auto">{children}</main>
        <GenerationsTray />
```

(A client component island rendered inside a server layout is fine.)

- [ ] **Step 3: Build the web app**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS — Next.js build completes with no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/generations-tray.tsx apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(web): add global video generations tray"
```

---

## Task 11: Composer Image/Video toggle + video controls + polling

**Files:**
- Modify: `apps/web/src/app/dashboard/composer/page.tsx`

> Read the current file first — the AI Image Generation card is at lines ~345–447 and image state at ~31–42. Mirror that card's structure (textarea + selects + Generate button + results) for video. Composer does NOT show a provider dropdown (provider is chosen in Settings; the backend resolves it), matching how image generation already works.

- [ ] **Step 1: Add a media-mode toggle + video state**

Near the image-generation state (around lines 31–42), add:

```tsx
const [mediaMode, setMediaMode] = useState<'image' | 'video'>('image');
const [videoPrompt, setVideoPrompt] = useState('');
const [videoAspect, setVideoAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
const [videoDuration, setVideoDuration] = useState(5);
const [videoJobId, setVideoJobId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the generate mutation + status poll**

Below the existing `generateImage` mutation (around line 101), add:

```tsx
const generateVideo = useMutation({
  mutationFn: () =>
    api.post<{ id: string }>('/ai/video', {
      workspaceId,
      prompt: videoPrompt,
      aspectRatio: videoAspect,
      durationSec: videoDuration,
    }),
  onSuccess: (job) => {
    setVideoJobId(job.id);
    qc.invalidateQueries({ queryKey: ['video-jobs', workspaceId] });
  },
  onError: (err: any) =>
    toast.error("Couldn't start video", {
      description: err?.message ?? 'Please try again.',
      duration: 8000,
    }),
});

const videoStatus = useQuery({
  queryKey: ['video-job', videoJobId],
  queryFn: () => api.get<any>(`/ai/video/${videoJobId}?workspaceId=${workspaceId}`),
  enabled: !!videoJobId && !!workspaceId,
  refetchInterval: (q) => {
    const s = (q.state.data as any)?.status;
    return s === 'GENERATING' || s === 'PENDING' ? 2500 : false;
  },
});
```

> Ensure `qc` (a `useQueryClient()` instance) exists in this component; the image card already uses TanStack Query, so reuse the same client. If it doesn't exist, add `const qc = useQueryClient();` near the top and import `useQueryClient` from `@tanstack/react-query`.

- [ ] **Step 3: Add the segmented toggle above the generation card**

Immediately before the AI Image Generation card (around line 345), add:

```tsx
<div className="mb-3 inline-flex rounded-lg border p-1">
  <button
    type="button"
    onClick={() => setMediaMode('image')}
    className={`rounded-md px-3 py-1.5 text-sm ${mediaMode === 'image' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
  >
    Image
  </button>
  <button
    type="button"
    onClick={() => setMediaMode('video')}
    className={`rounded-md px-3 py-1.5 text-sm ${mediaMode === 'video' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
  >
    Video
  </button>
</div>
```

- [ ] **Step 4: Gate the existing image card and add the video card**

Wrap the existing image card so it only renders when `mediaMode === 'image'`:

```tsx
{mediaMode === 'image' && (
  /* ...existing AI Image Generation card JSX (unchanged)... */
)}
```

Then add the video card after it:

```tsx
{mediaMode === 'video' && (
  <div className="rounded-lg border bg-background p-4">
    <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
      <Clapperboard className="h-4 w-4 text-primary" /> Generate video with AI
    </h3>
    <textarea
      value={videoPrompt}
      onChange={(e) => setVideoPrompt(e.target.value)}
      rows={3}
      placeholder="Describe the video you want…"
      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium">Aspect ratio</label>
        <select
          value={videoAspect}
          onChange={(e) => setVideoAspect(e.target.value as '9:16' | '16:9' | '1:1')}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="9:16">9:16 — vertical</option>
          <option value="16:9">16:9 — landscape</option>
          <option value="1:1">1:1 — square</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium">Duration: {videoDuration}s</label>
        <input
          type="range"
          min={2}
          max={10}
          value={videoDuration}
          onChange={(e) => setVideoDuration(Number(e.target.value))}
          className="mt-3 w-full"
        />
      </div>
    </div>

    <button
      type="button"
      disabled={!videoPrompt.trim() || generateVideo.isPending || videoStatus.data?.status === 'GENERATING'}
      onClick={() => generateVideo.mutate()}
      className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
    >
      {generateVideo.isPending || videoStatus.data?.status === 'GENERATING' ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
      ) : (
        <>Generate video</>
      )}
    </button>

    {videoStatus.data?.status === 'READY' && videoStatus.data?.mediaAsset && (
      <div className="mt-4">
        <video
          src={videoStatus.data.mediaAsset.url}
          controls
          className="w-full max-w-sm rounded-lg border"
        />
        <button
          type="button"
          onClick={() => {
            setAttachedImageIds((ids) =>
              ids.includes(videoStatus.data.mediaAsset.id) ? ids : [...ids, videoStatus.data.mediaAsset.id],
            );
            toast.success('Video attached to post');
          }}
          className="mt-2 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Attach to post
        </button>
      </div>
    )}

    {videoStatus.data?.status === 'FAILED' && (
      <p className="mt-3 text-sm text-destructive">{videoStatus.data.errorMessage ?? 'Generation failed.'}</p>
    )}
  </div>
)}
```

> `setAttachedImageIds` is the existing attach-state setter the image card uses (it stores `MediaAsset` ids on the post). Reuse it so attached videos flow through the same publish path. If the setter is named differently, use the existing one verbatim.

- [ ] **Step 5: Add the `Clapperboard` icon import**

Ensure `Clapperboard` is imported from `lucide-react` at the top of the file (the image card already imports `Loader2`, `Image as ImageIcon`). Add `Clapperboard` to that import list.

- [ ] **Step 6: Build the web app**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS — no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/composer/page.tsx
git commit -m "feat(web): add Image/Video toggle and AI video generation to Composer"
```

---

## Task 12: Settings — Video block in the AI defaults card

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/ai-defaults-card.tsx`

- [ ] **Step 1: Extend the `CredsView` interface**

In the `CredsView` interface (lines 16–24), after `pollinationsModel: string | null;` add:

```tsx
  pollinationsVideoModel: string | null;
  runwayModel: string | null;
  klingModel: string | null;
  veoVideoModel: string | null;
  preferredVideoProvider: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
  runway?: { configured: boolean };
  kling?: { configured: boolean };
```

- [ ] **Step 2: Add the video model catalogs + field map**

After the `POLLINATIONS_IMAGE_MODELS` array (line 56), add:

```tsx
const DEMO_VIDEO_MODELS: ModelOption[] = [
  { value: 'demo', label: 'demo — instant sample clip (free, default)' },
];
const POLLINATIONS_VIDEO_MODELS: ModelOption[] = [
  { value: 'pollinations-t2v', label: 'pollinations-t2v — free text-to-video' },
];
const RUNWAY_VIDEO_MODELS: ModelOption[] = [
  { value: 'runway-gen3', label: 'runway-gen3 — Gen-3 Alpha' },
];
const KLING_VIDEO_MODELS: ModelOption[] = [
  { value: 'kling-v2', label: 'kling-v2 — Kling 2.0' },
];
const VEO_VIDEO_MODELS: ModelOption[] = [
  { value: 'veo-3', label: 'veo-3 — Google Veo 3' },
];

// Which providers have a working adapter in this build. Others show as "coming soon".
const VIDEO_PROVIDER_READY: Record<string, boolean> = {
  demo: true, pollinations: false, runway: false, kling: false, veo: false,
};
```

In the `MODEL_FIELD` map (lines 59–65), add the video entries:

```tsx
  'video:pollinations': 'pollinationsVideoModel',
  'video:runway': 'runwayModel',
  'video:kling': 'klingModel',
  'video:veo': 'veoVideoModel',
```

(Demo has no model field — it is never saved.)

- [ ] **Step 3: Add video local state + initialization**

After the image state (lines 78–79), add:

```tsx
const [videoProvider, setVideoProvider] = useState<'demo' | 'pollinations' | 'runway' | 'kling' | 'veo'>('demo');
const [videoModel, setVideoModel] = useState('demo');
```

Inside the `useEffect(() => { ... }, [data])` block (after the image init, before the closing of the effect at line 98), add:

```tsx
const vp = data.preferredVideoProvider ?? 'demo';
setVideoProvider(vp);
setVideoModel(
  vp === 'demo' ? 'demo'
    : vp === 'pollinations' ? (data.pollinationsVideoModel ?? 'pollinations-t2v')
      : vp === 'runway' ? (data.runwayModel ?? 'runway-gen3')
        : vp === 'kling' ? (data.klingModel ?? 'kling-v2')
          : (data.veoVideoModel ?? 'veo-3'),
);
```

- [ ] **Step 4: Add the Video block UI after the Image block**

After the Image generation block's closing `</div>` (line 250) and before the saving indicator (line 252), add:

```tsx
{/* Video generation */}
<div className="rounded-lg border bg-background p-4">
  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
    <Clapperboard className="h-4 w-4 text-primary" /> Video generation
  </h3>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div>
      <label className="text-xs font-medium">Provider</label>
      <select
        value={videoProvider}
        onChange={(e) => {
          const p = e.target.value as 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo';
          setVideoProvider(p);
          savePref.mutate({ preferredVideoProvider: p });
        }}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="demo">Demo — instant sample clip (free)</option>
        <option value="pollinations" disabled={!VIDEO_PROVIDER_READY.pollinations}>
          Pollinations — free{!VIDEO_PROVIDER_READY.pollinations ? ' (coming soon)' : ''}
        </option>
        <option value="runway" disabled={!VIDEO_PROVIDER_READY.runway}>
          Runway{!VIDEO_PROVIDER_READY.runway ? ' (coming soon)' : ''}
        </option>
        <option value="kling" disabled={!VIDEO_PROVIDER_READY.kling}>
          Kling{!VIDEO_PROVIDER_READY.kling ? ' (coming soon)' : ''}
        </option>
        <option value="veo" disabled={!VIDEO_PROVIDER_READY.veo}>
          Google Veo{!VIDEO_PROVIDER_READY.veo ? ' (coming soon)' : ''}
        </option>
      </select>
    </div>
    <div>
      <label className="text-xs font-medium">Model</label>
      <select
        value={videoModel}
        disabled={videoProvider === 'demo'}
        onChange={(e) => {
          const m = e.target.value;
          setVideoModel(m);
          const field = MODEL_FIELD[`video:${videoProvider}`];
          if (field) saveModel.mutate({ field, model: m });
        }}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
      >
        {(videoProvider === 'demo' ? DEMO_VIDEO_MODELS
          : videoProvider === 'pollinations' ? POLLINATIONS_VIDEO_MODELS
            : videoProvider === 'runway' ? RUNWAY_VIDEO_MODELS
              : videoProvider === 'kling' ? KLING_VIDEO_MODELS
                : VEO_VIDEO_MODELS
        ).map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </div>
  </div>
  <p className="mt-2 text-xs text-muted-foreground">
    Only <strong>Demo</strong> is active in this build — Runway, Kling, Veo and Pollinations video arrive in upcoming updates.
  </p>
</div>
```

- [ ] **Step 5: Add the `Clapperboard` icon import**

Add `Clapperboard` to the `lucide-react` import at the top (currently imports `Sparkles, Image as ImageIcon, Loader2`).

- [ ] **Step 6: Build the web app**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS — no type errors. (The `savePref` mutation's body type already accepts arbitrary `{ preferredTextProvider?, preferredImageProvider? }`; widen it if TypeScript complains — change its `body` param type to also include `preferredVideoProvider?: string`.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/settings/ai-defaults-card.tsx
git commit -m "feat(web): add video provider + model selection to AI defaults card"
```

---

## Task 13: Media library in-flight rendering tiles

**Files:**
- Modify: `apps/web/src/app/dashboard/media/page.tsx`

> The page currently queries `api.get<MediaAsset[]>('/media?workspaceId=...')`. Add a second query for in-flight video jobs and render placeholder tiles for any that are still GENERATING, so users see work-in-progress in the library (not just finished assets).

- [ ] **Step 1: Add a query for active video jobs**

Inside the component, alongside the existing media query, add:

```tsx
const videoJobs = useQuery({
  queryKey: ['video-jobs', workspaceId],
  queryFn: () => api.get<any[]>(`/ai/video?workspaceId=${workspaceId}`),
  enabled: !!workspaceId,
  refetchInterval: (q) =>
    (q.state.data as any[] | undefined)?.some((j) => j.status === 'GENERATING' || j.status === 'PENDING') ? 2500 : false,
});

const pending = (videoJobs.data ?? []).filter((j) => j.status === 'GENERATING' || j.status === 'PENDING');
```

> Ensure `useQuery` is imported from `@tanstack/react-query` (the existing media query already uses it).

- [ ] **Step 2: Render placeholder tiles at the top of the grid**

Inside the assets grid (the `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4` container), before the mapped assets, add:

```tsx
{pending.map((j) => (
  <div
    key={j.id}
    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-secondary/30 p-3 text-center"
  >
    <Loader2 className="h-5 w-5 animate-spin text-primary" />
    <span className="line-clamp-2 text-xs text-muted-foreground">{j.prompt}</span>
    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rendering…</span>
  </div>
))}
```

- [ ] **Step 3: Add the `Loader2` icon import**

Ensure `Loader2` is imported from `lucide-react` at the top of the file.

- [ ] **Step 4: Build the web app**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/media/page.tsx
git commit -m "feat(web): show in-flight video rendering tiles in the media library"
```

---

## Task 14: Full validation + manual testing pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm --filter @inboudly/api test`
Expected: PASS — all specs green (schema: 5, resolver: 4, demo provider: 1).

- [ ] **Step 2: Type-check both apps**

Run: `pnpm --filter @inboudly/api type-check && pnpm --filter @inboudly/web build`
Expected: PASS — no type errors in either app.

- [ ] **Step 3: Manual end-to-end test (dev servers running)**

Start the API and web dev servers, sign in, then verify:

1. **Settings → AI defaults** shows a **Video generation** block with Provider = Demo (default), the "coming soon" note, and the model dropdown disabled for Demo.
2. **Composer** shows an **Image / Video** toggle. Switch to **Video**, enter a prompt, pick 9:16, set duration, click **Generate video**.
3. The button shows **Generating…**; the **Generations tray** (bottom-right) appears and shows the job spinning.
4. After ~1–2s the job flips to **Ready**; the Composer shows a playable `<video>` with controls, and an **Attach to post** button.
5. Click **Attach to post** → success toast; the video id joins the post's attached media.
6. **Media library** shows a "Rendering…" placeholder tile while generating, then the finished video tile.
7. Trigger a failure path is N/A for Demo (it always succeeds) — confirm the FAILED branch compiles and renders by temporarily throwing in `DemoVideoProvider.generate` if desired, then revert.

Cross-check these against the planned-feature card (#7) in `docs/phase2-testing-guide.html`.

- [ ] **Step 4: Update the testing guide status (optional but recommended)**

In `docs/phase2-testing-guide.html`, flip Feature #7's tier badge from `Planned` to a live tier and move its callout from "Not yet live — in design" to a "ready to test" note, since the Demo path is now testable. (Keep the existing 6-feature progress bar logic intact.)

- [ ] **Step 5: Final commit (if the guide was updated)**

```bash
git add docs/phase2-testing-guide.html
git commit -m "docs: mark AI video generation (Demo) ready to test in phase 2 guide"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Plan 1 covers the spec's backbone surfaces — Composer Image/Video toggle (Task 11), Settings provider+model per task (Task 12), Generations tray (Task 10), Media library in-flight state (Task 13) — plus the async job model and a guaranteed-free default generator. Runway/Kling/Veo/Pollinations *adapters* and Faceless per-scene clips are intentionally deferred to Plans 2 and 3; their schema fields, resolver precedence, and UI slots are stubbed here so those plans only add adapters.

**Placeholder scan:** No `TBD`/`TODO`/"add error handling" placeholders — every code step shows complete code. The two soft spots are flagged inline with explicit instructions: (a) the `me` query path in the tray/composer must be copied verbatim from Composer's existing usage, and (b) the existing attach-state setter name must be reused. Both are "match the existing call site," not invented APIs.

**Type consistency:** `VideoProviderName` is defined once in shared (`VideoProviderSchema`) and mirrored as a string-union in `ai-credentials.service.ts`; the five values (`demo`/`pollinations`/`runway`/`kling`/`veo`) are identical across schema, service, controller, and both web files. Model field names (`pollinationsVideoModel`/`runwayModel`/`klingModel`/`veoVideoModel`) match across Prisma, `AiProviderModelName`, `ALLOWED_MODEL_FIELDS`, `view()`, and the web `MODEL_FIELD` map. `VideoGeneration.status` reuses the existing `VideoStatus` enum. `VideoGenerateResult.asset` (`{ id, url }`) matches what `MediaService.register` returns and what the tray/composer read (`mediaAsset.url`).

---

## Execution Handoff

This is **Plan 1 of 3**. Plans 2 (Runway + keyed Pollinations adapters) and 3 (Kling + Veo + Faceless per-scene clips) will be written as separate documents once Plan 1 lands — each just adds an adapter to the `VideoProvider` switch and flips its `VIDEO_PROVIDER_READY` flag.

