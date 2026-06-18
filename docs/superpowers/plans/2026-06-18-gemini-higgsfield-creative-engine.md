# Gemini + Higgsfield Creative-Engine Re-Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse Inboudly's AI stack to exactly two vendors — **Gemini** (captions + images + embeddings) and **Higgsfield's own platform API** (`platform.higgsfield.ai`, cinematic video) — behind a swappable provider abstraction, deleting Claude, OpenAI, Pollinations, ElevenLabs, and the direct Runway/Kling/Veo video providers.

**Architecture:** Keep the existing provider-abstraction seams (`VideoProvider` interface, `VideoGenerationService` detached-runner pipeline, the BYOK `AiCredentialsService` resolver). Swap the *implementations* behind them: text/image resolvers become Gemini-only; the 5 video providers become a single `HiggsfieldVideoProvider` that calls **Higgsfield's own documented REST API** (`platform.higgsfield.ai`, `Authorization: Key {key}:{secret}`, async submit→poll); OpenAI embeddings migrate to Gemini embeddings so the brand-memory moat survives. No vendor is a single point of failure because every capability still resolves through the abstraction — adding a second provider later (e.g. Segmind or HeyGen for the v1.1 talking-avatar capability, which Higgsfield's direct API does not document) is a new class, not a rewrite.

> **Provider decision (2026-06-18):** Higgsfield is wired **directly** (`platform.higgsfield.ai`), NOT via the Segmind aggregator — direct is cheaper, exposes all 100+ models, supports native webhooks, and Segmind would not shield us from Higgsfield outages anyway (its Higgsfield models run on Higgsfield). Segmind remains a documented **fallback** for the avatar capability in v1.1.

**Tech Stack:** NestJS (api), Next.js (web), Prisma + Supabase Postgres, Zod (shared), `@google/generative-ai`, Higgsfield REST (`https://platform.higgsfield.ai`), Cloudflare R2, Jest.

**Scope (this plan):** the AI creative engine only.
**Out of scope (separate plans):** connector restructure (cut Pinterest, defer IG/TikTok/YouTube, RedNote→content-prep); avatar + voice (v1.1 — needs a Mandarin TTS); the generation-first home + compounding brand-memory UX.

**Standing risks to honor (do NOT silently ignore):**
- ⚠️ **Higgsfield ToS** for SaaS wrapping is unverified — fine to build, must be legally cleared before charging money.
- ⚠️ **Mandarin output quality** is untested — every new provider task includes a manual bilingual smoke check.
- ⚠️ **Higgsfield key (`api_key:api_key_secret`) is BYOK** — the user supplies it; never commit a key.

---

## File Structure

**DELETE (api):**
- `apps/api/src/modules/ai/claude-text.service.ts`
- `apps/api/src/modules/ai/openai-image.service.ts`
- `apps/api/src/modules/ai/pollinations-image.service.ts`
- `apps/api/src/modules/ai/video/demo-video.provider.ts` (+ `.spec.ts`)
- `apps/api/src/modules/ai/video/pollinations-video.provider.ts` (+ `.spec.ts`)
- `apps/api/src/modules/ai/video/runway-video.provider.ts`
- `apps/api/src/modules/ai/video/kling-video.provider.ts`
- `apps/api/src/modules/ai/video/veo-video.provider.ts`

**CREATE (api):**
- `apps/api/src/modules/ai/video/higgsfield-video.provider.ts` (+ `.spec.ts`)

**MODIFY (api):**
- `apps/api/src/modules/ai/embeddings.service.ts` — OpenAI → Gemini embeddings
- `apps/api/src/modules/ai/ai.controller.ts` — Gemini-only text + image
- `apps/api/src/modules/ai/ai.module.ts` — prune providers, register Higgsfield
- `apps/api/src/modules/ai/video/video-generation.service.ts` — single adapter
- `apps/api/src/modules/ai/video/video-generation.reaper.spec.ts` — constructor arity
- `apps/api/src/modules/ai-credentials/ai-credentials.service.ts` — prune keys/models, Gemini-only resolvers, `higgsfieldKey`
- `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts` — prune allow-lists
- `apps/api/src/modules/videos/faceless-video.service.ts` — Anthropic → Gemini script-gen
- `packages/shared/src/schemas.ts` — `VideoProviderSchema = ['higgsfield']`
- `packages/database/prisma/schema.prisma` — prune key/model columns, add `higgsfieldKey`

**MODIFY (web):**
- `apps/web/src/app/dashboard/settings/ai-providers-card.tsx` — Gemini + Higgsfield rows only
- `apps/web/src/app/dashboard/settings/ai-defaults-card.tsx` — Gemini fixed; video = Higgsfield

**KEEP (untouched core — the abstraction + moat):**
- `apps/api/src/modules/ai/video/video-provider.interface.ts`
- `apps/api/src/modules/ai/video/video-generation.controller.ts`
- `apps/api/src/modules/ai/gemini-text.service.ts`, `gemini-image.service.ts`
- `apps/api/src/modules/brand/**` (voice-training moat), `common/pinecone/**`

---

## Phase A — Gemini-only brain

### Task A1: Migrate embeddings OpenAI → Gemini

**Why first:** every other "cut OpenAI" step is blocked until the moat's embedder no longer imports `openai`.

**Files:**
- Modify: `apps/api/src/modules/ai/embeddings.service.ts`
- Test: `apps/api/src/modules/ai/embeddings.service.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/modules/ai/embeddings.service.spec.ts
import { EmbeddingsService } from './embeddings.service';

describe('EmbeddingsService', () => {
  it('exposes Gemini embedding model + 3072 dims (matches Pinecone index)', () => {
    expect(EmbeddingsService.MODEL).toBe('gemini-embedding-001'); // gemini-only stack
    expect(EmbeddingsService.DIMENSION).toBe(3072);
  });

  it('embedMany returns [] for empty input without calling the API', async () => {
    const svc = new EmbeddingsService();
    await expect(svc.embedMany('unused-key', [])).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @inboudly/api test -- embeddings.service`
Expected: FAIL — `MODEL` still `'text-embedding-3-large'`.

- [ ] **Step 3: Replace the implementation**

```typescript
// apps/api/src/modules/ai/embeddings.service.ts
import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * BYOK embeddings via Gemini gemini-embedding-001 (3072 dim, matches the
 * existing Pinecone index `inboudly-brand-voices`). Accepts the workspace's
 * Gemini API key. No client caching — different workspaces use different keys.
 */
@Injectable()
export class EmbeddingsService {
  static readonly MODEL = 'gemini-embedding-001';
  static readonly DIMENSION = 3072;

  async embedOne(apiKey: string, text: string): Promise<number[]> {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: EmbeddingsService.MODEL,
    });
    const res = await model.embedContent({
      content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EmbeddingsService.DIMENSION,
    } as never);
    return res.embedding.values;
  }

  async embedMany(apiKey: string, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    // Gemini batchEmbedContents caps ~100 requests/call; chunk to be safe.
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: EmbeddingsService.MODEL,
    });
    const all: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const res = await model.batchEmbedContents({
        requests: batch.map((t) => ({
          content: { role: 'user', parts: [{ text: t.slice(0, 8000) }] },
          outputDimensionality: EmbeddingsService.DIMENSION,
        })),
      } as never);
      for (const e of res.embeddings) all.push(e.values);
    }
    return all;
  }
}
```

> **Note for implementer:** `@google/generative-ai` is already a dependency (used by `gemini-text.service.ts`). Confirm `embedContent`/`batchEmbedContents` accept `outputDimensionality` in the installed version; if the typed surface rejects it, the `as never` cast keeps the runtime call (the REST field is `outputDimensionality`). Verify one real call returns a 3072-length array before moving on.

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @inboudly/api test -- embeddings.service`
Expected: PASS.

- [ ] **Step 5: Find every caller and switch the key it passes**

Run: `pnpm -s exec rg -n "embedOne|embedMany|EmbeddingsService" apps/api/src` (or use the editor).
For each caller (expected: `apps/api/src/modules/brand/voice-training.service.ts`), the API key argument must come from the workspace **Gemini** key, not OpenAI. Update the call site to resolve `geminiKey` via `AiCredentialsService.getDecryptedKey(workspaceId, 'geminiKey')`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/embeddings.service.ts apps/api/src/modules/ai/embeddings.service.spec.ts apps/api/src/modules/brand/voice-training.service.ts
git commit -m "refactor(ai): move embeddings from OpenAI to Gemini (gemini-embedding-001, 3072d)"
```

### Task A2: ai.controller text + image → Gemini-only

**Files:**
- Modify: `apps/api/src/modules/ai/ai.controller.ts`

- [ ] **Step 1: Replace the controller body**

```typescript
// apps/api/src/modules/ai/ai.controller.ts
import {
  BadRequestException, Body, Controller, HttpException, Logger, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GeminiTextService } from './gemini-text.service';
import { GeminiImageService } from './gemini-image.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import {
  GenerateTextSchema, GenerateImageSchema,
  type GenerateTextInput, type GenerateImageInput,
} from '@inboudly/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Single-vendor BYOK: Gemini powers both captions and images. The workspace
 * supplies one Google AI Studio key (free tier covers captions). Inboudly
 * never bills for AI usage.
 */
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private gemini: GeminiTextService,
    private geminiImage: GeminiImageService,
    private credentials: AiCredentialsService,
  ) {}

  @Post('text')
  async generateText(
    @Body(new ZodValidationPipe(GenerateTextSchema)) input: GenerateTextInput,
  ) {
    const { apiKey, model } = await this.credentials.requireTextProvider(input.workspaceId);
    return this.gemini.generatePostText(apiKey, { ...input, model });
  }

  @Post('image')
  async generateImage(
    @Body(new ZodValidationPipe(GenerateImageSchema)) input: GenerateImageInput,
  ) {
    const { apiKey, model } = await this.credentials.requireImageProvider(input.workspaceId);
    try {
      const result = await this.geminiImage.generate(apiKey, {
        workspaceId: input.workspaceId,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        count: input.count,
        model,
      });
      if (!result?.assets?.length) throw new BadRequestException(this.imageHint());
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Gemini image gen failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(this.imageHint());
    }
  }

  private imageHint(): string {
    return `Gemini's free tier doesn't include image generation. Enable paid Google Cloud billing on your key's project, then try again.`;
  }
}
```

- [ ] **Step 2: Build the api to surface broken references**

Run: `pnpm --filter @inboudly/api type-check`
Expected: errors ONLY about `requireTextProvider`/`requireImageProvider` return shapes (fixed in Task C2) and removed services still imported elsewhere (faceless, Task A4). No errors inside `ai.controller.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/ai/ai.controller.ts
git commit -m "refactor(ai): ai.controller text+image are Gemini-only"
```

### Task A4: faceless-video.service script-gen → Gemini-only

> (Task A3 folded into A2 — both endpoints done together.)

**Files:**
- Modify: `apps/api/src/modules/videos/faceless-video.service.ts`

- [ ] **Step 1: Remove the Anthropic path**

In `faceless-video.service.ts`: delete `import Anthropic from '@anthropic-ai/sdk';`. Find the method that picks Claude vs Gemini for script generation (search `Anthropic(` and `anthropicKey`). Replace its body so it ALWAYS resolves the workspace **Gemini** key via `this.credentials.getDecryptedKey(workspaceId, 'geminiKey')` and calls the existing Gemini script path. If no Gemini key, throw:

```typescript
const geminiKey = await this.credentials.getDecryptedKey(workspaceId, 'geminiKey');
if (!geminiKey) {
  throw new BadRequestException(
    'Add a Google (Gemini) API key in Settings → AI Providers to generate faceless scripts.',
  );
}
// ...use geminiKey with the existing GoogleGenerativeAI(...) script path...
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @inboudly/api type-check`
Expected: no remaining `@anthropic-ai/sdk` import errors in this file.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/videos/faceless-video.service.ts
git commit -m "refactor(videos): faceless script-gen is Gemini-only"
```

### Task A5: Delete Claude/OpenAI/Pollinations services + prune ai.module

**Files:**
- Delete: `claude-text.service.ts`, `openai-image.service.ts`, `pollinations-image.service.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Delete the three service files.**

- [ ] **Step 2: Rewrite ai.module providers/exports** (final form after Phase B too — see Task B4). For now remove the three deleted services from imports/providers/exports.

- [ ] **Step 3: Type-check; fix any stragglers**

Run: `pnpm --filter @inboudly/api type-check`
Expected: no references to the deleted classes remain (Task A1/A2/A4 already cleared the known ones).

- [ ] **Step 4: Commit**

```bash
git add -A apps/api/src/modules/ai
git commit -m "chore(ai): delete Claude/OpenAI/Pollinations services"
```

---

## Phase B — Video engine: Higgsfield (direct platform API)

### Task B1: HiggsfieldVideoProvider (TDD)

**Files:**
- Create: `apps/api/src/modules/ai/video/higgsfield-video.provider.ts`
- Test: `apps/api/src/modules/ai/video/higgsfield-video.provider.spec.ts`

- [ ] **Step 1: Write the failing test** (pure logic — endpoint mapping + key guard; no network)

```typescript
// higgsfield-video.provider.spec.ts
import { BadRequestException } from '@nestjs/common';
import { HiggsfieldVideoProvider } from './higgsfield-video.provider';

describe('HiggsfieldVideoProvider', () => {
  const provider = new HiggsfieldVideoProvider({} as any, {} as any);

  it('throws a clear error when no Higgsfield key is supplied', async () => {
    await expect(
      provider.generate('', {
        workspaceId: 'w', prompt: 'a cat', durationSec: 5,
        aspectRatio: '9:16', model: 'higgsfield',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reference image (image-to-video model)', async () => {
    await expect(
      provider.generate('hf-key:hf-secret', {
        workspaceId: 'w', prompt: 'a cat', durationSec: 5,
        aspectRatio: '9:16', model: 'higgsfield',
      }),
    ).rejects.toThrow(/reference image/i);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @inboudly/api test -- higgsfield-video.provider`
Expected: FAIL — class doesn't exist.

- [ ] **Step 3: Implement against Higgsfield's documented async REST flow**

```typescript
// apps/api/src/modules/ai/video/higgsfield-video.provider.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';

const HF_BASE = 'https://platform.higgsfield.ai';
// Higgsfield's image-to-video model id. Other ids exist on the platform
// (e.g. 'kling-video/v2.1/pro/image-to-video'); confirm model id + request
// body fields against https://docs.higgsfield.ai/docs before first run.
const HF_MODEL = 'higgsfield-ai/dop/standard';

/**
 * Higgsfield cinematic video via Higgsfield's OWN platform API
 * (platform.higgsfield.ai) — direct, not via an aggregator. BYOK: the stored
 * higgsfieldKey is "api_key:api_key_secret" and goes verbatim into the
 * Authorization header (`Key key:secret`). Higgsfield image-to-video is
 * image-driven — a reference image is required.
 */
@Injectable()
export class HiggsfieldVideoProvider implements VideoProvider {
  readonly name = 'higgsfield';
  private readonly logger = new Logger(HiggsfieldVideoProvider.name);

  constructor(private media: MediaService, private r2: R2StorageService) {}

  async generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!apiKey || !apiKey.includes(':')) {
      throw new BadRequestException(
        'Higgsfield key not configured. Add it as "api_key:api_key_secret" in Settings → AI Providers (from cloud.higgsfield.ai).',
      );
    }
    if (!params.referenceImageUrl) {
      throw new BadRequestException(
        'Higgsfield video is image-driven — generate or attach an image first, then animate it.',
      );
    }
    const auth = `Key ${apiKey}`; // apiKey is already "key:secret"

    const submit = await fetch(`${HF_BASE}/${HF_MODEL}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: params.referenceImageUrl,
        prompt: params.prompt,
        aspect_ratio: params.aspectRatio,
      }),
    });
    if (!submit.ok) {
      const detail = await submit.text().catch(() => submit.statusText);
      throw new Error(`Higgsfield submit ${submit.status}: ${detail.slice(0, 200)}`);
    }
    const submission = (await submit.json()) as { request_id?: string; status_url?: string };
    const requestId = submission.request_id;
    if (!requestId) throw new Error('Higgsfield did not return a request_id');

    const videoUrl = await this.poll(requestId, auth);

    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Higgsfield result download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const r2Url = await this.r2.putObject(`videos/higgsfield/${randomUUID()}.mp4`, buf, 'video/mp4');

    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url: r2Url,
      filename: 'higgsfield.mp4',
      mimeType: 'video/mp4',
      sizeBytes: buf.length,
      durationSec: params.durationSec,
      aiPrompt: params.prompt,
      aiModel: HF_MODEL,
    });
    this.logger.log(`Higgsfield video for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model: 'higgsfield' };
  }

  private async poll(requestId: string, auth: string): Promise<string> {
    for (let i = 0; i < 120; i++) { // ~10 min @ 5s
      const r = await fetch(`${HF_BASE}/requests/${requestId}/status`, { headers: { Authorization: auth } });
      if (!r.ok) throw new Error(`Higgsfield status ${r.status}`);
      const d = (await r.json()) as { status?: string; results?: { url?: string }[]; url?: string };
      if (d.status === 'completed') {
        const url = d.results?.[0]?.url ?? d.url;
        if (!url) throw new Error('Higgsfield completed but no media URL');
        return url;
      }
      if (d.status === 'failed' || d.status === 'nsfw') throw new Error(`Higgsfield generation ${d.status}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
    throw new Error('Higgsfield generation timed out after 10 minutes');
  }
}
```

> **Note for implementer:** auth header (`Key key:secret`), the async pattern (`request_id` → `GET /requests/{id}/status`, statuses `queued|in_progress|completed|failed|nsfw`), and the portal (`cloud.higgsfield.ai`) are confirmed from https://docs.higgsfield.ai/docs/llms-full.txt. The two things to confirm on the live model page before trusting the happy path: the exact **model id** (`higgsfield-ai/dop/standard`) and the **request-body field names** (`image_url`, `aspect_ratio`) + where the result URL sits in the completed payload. **Optional upgrade:** Higgsfield supports webhooks (`?hf_webhook=<public-url>`) — in production you can replace the poll loop with a callback; keep polling for local dev (no public URL).

- [ ] **Step 4: Run the test, verify it passes** — `pnpm --filter @inboudly/api test -- higgsfield-video.provider` → PASS.

- [ ] **Step 5: Manual bilingual smoke** — with a real Higgsfield key (`api_key:api_key_secret` from cloud.higgsfield.ai) + a test image URL, generate once with an English prompt and once with a 中文 prompt; confirm both return a playable MP4. Record the result in the PR description.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/video/higgsfield-video.provider.ts apps/api/src/modules/ai/video/higgsfield-video.provider.spec.ts
git commit -m "feat(ai): add HiggsfieldVideoProvider (platform.higgsfield.ai)"
```

### Task B2: Single adapter in VideoGenerationService + delete old providers

**Files:**
- Modify: `apps/api/src/modules/ai/video/video-generation.service.ts`
- Modify: `apps/api/src/modules/ai/video/video-generation.reaper.spec.ts`
- Delete: demo / pollinations / runway / kling / veo providers (+ their specs)

- [ ] **Step 1: Replace constructor + `adapterFor` + `failureMessage`**

```typescript
// constructor
constructor(
  private prisma: PrismaService,
  private credentials: AiCredentialsService,
  private higgsfield: HiggsfieldVideoProvider,
) {}

// only one real provider now; keep the seam for future swaps
private adapterFor(_provider: string): VideoProvider {
  return this.higgsfield;
}

private failureMessage(_provider: string, rawMsg: string): string {
  return `${rawMsg}. Check your Higgsfield key in Settings → AI Providers and that your account has credit.`;
}
```
Update the import block: remove demo/pollinations/runway/kling/veo imports; add `import { HiggsfieldVideoProvider } from './higgsfield-video.provider';`.

- [ ] **Step 2: Fix the reaper spec constructor arity**

```typescript
// video-generation.reaper.spec.ts
// Constructor: (prisma, credentials, higgsfield) — only prisma is used here.
const svc = new VideoGenerationService(prisma, {} as any, {} as any);
```

- [ ] **Step 3: Delete the five provider files + their specs.**

- [ ] **Step 4: Test + type-check**

Run: `pnpm --filter @inboudly/api test -- video-generation.reaper` → PASS.
Run: `pnpm --filter @inboudly/api type-check` → only errors expected are in `ai.module.ts` (Task B4).

- [ ] **Step 5: Commit**

```bash
git add -A apps/api/src/modules/ai/video
git commit -m "refactor(ai): video engine resolves to Higgsfield only; delete legacy providers"
```

### Task B3: Shared schema → higgsfield only

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/generate-video-schema.spec.ts`

- [ ] **Step 1: Narrow the enum**

```typescript
export const VideoProviderSchema = z.enum(['higgsfield']);
```

- [ ] **Step 2: Update the spec** to assert `VideoProviderSchema.options` equals `['higgsfield']` and that an unknown provider throws.

- [ ] **Step 3: Build shared + test**

Run: `pnpm --filter @inboudly/shared build && pnpm --filter @inboudly/shared test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/generate-video-schema.spec.ts
git commit -m "refactor(shared): VideoProviderSchema = higgsfield only"
```

### Task B4: Finalize ai.module

**Files:** Modify `apps/api/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Write the final module** (providers: `GeminiTextService`, `GeminiImageService`, `EmbeddingsService`, `HiggsfieldVideoProvider`, `VideoGenerationService`, `WorkspacesService`; controllers: `AiController`, `VideoGenerationController`; exports: the Gemini services + `EmbeddingsService` + `VideoGenerationService`). Remove every deleted class.

- [ ] **Step 2: Type-check whole api** — `pnpm --filter @inboudly/api type-check` → clean.

- [ ] **Step 3: Commit** — `git commit -am "chore(ai): finalize AiModule to Gemini + Higgsfield"`.

---

## Phase C — Credentials + schema prune

### Task C1: Prisma — prune key/model columns, add higgsfieldKey

**Files:** Modify `packages/database/prisma/schema.prisma`

- [ ] **Step 1: In `WorkspaceAiCredentials`,** remove columns `anthropicKey`, `openaiKey`, `runwayKey`, `klingKey`, `pollinationsKey`, `elevenLabsKey`, `sunoKey`, `anthropicModel`, `openaiModel`, `pollinationsModel`, `pollinationsVideoModel`, `runwayModel`, `klingModel`, `veoVideoModel`, `preferredTextProvider`, `preferredImageProvider`, `preferredVideoProvider`. **Keep** `geminiKey`, `geminiModel`, `geminiImageModel`, `pineconeKey`. **Add** `higgsfieldKey String? @db.Text`.

- [ ] **Step 2: Push (accept data loss — dropping unused columns)**

Run: `cd packages/database && pnpm dotenv -e ../../.env -- prisma db push --accept-data-loss`
Expected: "Your database is now in sync". Then `pnpm db:generate` from repo root (stop `pnpm dev` first if the Prisma client EPERM-locks on Windows).

- [ ] **Step 3: Commit** — `git commit -am "feat(db): prune AI credential columns to Gemini + Higgsfield + Pinecone"`.

### Task C2: AiCredentialsService + controller — Gemini-only resolvers

**Files:**
- Modify: `apps/api/src/modules/ai-credentials/ai-credentials.service.ts`
- Modify: `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts`

- [ ] **Step 1: Service** — set `AiProviderKeyName = 'geminiKey' | 'higgsfieldKey' | 'pineconeKey'`; `AiProviderModelName = 'geminiModel' | 'geminiImageModel'`; `VideoProviderName = 'higgsfield'`. `requireTextProvider` returns `{ apiKey: <geminiKey>, model: getModel('gemini') }` or throws if absent. `requireImageProvider` returns `{ apiKey: <geminiKey>, model: getImageModel('gemini') }` or throws. `resolveVideoProvider` returns `{ provider: 'higgsfield', apiKey: <higgsfieldKey>, model: 'higgsfield' }`. Rewrite `view()` to expose only `gemini`, `higgsfield`, `pinecone` + the two Gemini model fields. Delete `setPreferences` provider fields (no preferred-provider concept survives) — keep the method only if other code calls it; otherwise remove and its controller route.

- [ ] **Step 2: Controller** — `ALLOWED_KEY_FIELDS = ['geminiKey','higgsfieldKey','pineconeKey']`; `ALLOWED_MODEL_FIELDS = ['geminiModel','geminiImageModel']`; delete the `preferences` route if `setPreferences` was removed; keep the `gemini` branch of the `:provider/test` route, delete `anthropic`/`openai` branches.

- [ ] **Step 3: Type-check api** — clean.

- [ ] **Step 4: Commit** — `git commit -am "refactor(ai-credentials): Gemini + Higgsfield only; drop multi-provider resolvers"`.

---

## Phase D — Frontend prune

### Task D1: ai-providers-card → Gemini + Higgsfield

**Files:** Modify `apps/web/src/app/dashboard/settings/ai-providers-card.tsx`

- [ ] **Step 1:** Set `ProviderId = 'gemini' | 'higgsfield'`. `AiCredentialsView = { gemini: ProviderState; higgsfield: KeyOnlyState }`. `PROVIDERS` = the Gemini row (text+image, free-tier link `https://aistudio.google.com/apikey`) + a Higgsfield row (`id:'higgsfield'`, `keyField:'higgsfieldKey'`, name `'Higgsfield (video)'`, `noTest:true`, signup `https://cloud.higgsfield.ai`, keyPlaceholder `'api_key:api_key_secret'`, helpText `'Cinematic video. Paste your key + secret from cloud.higgsfield.ai as api_key:api_key_secret. Pay-as-you-go, never billed by Inboudly.'`). Rebuild the three state dictionaries (`keyDrafts`/`modelDrafts`/`testResults`) to those two ids. `categoryTag`: gemini→`'Text + Image'`, higgsfield→`'Video'`.

- [ ] **Step 2:** `pnpm --filter @inboudly/web type-check` → clean.

- [ ] **Step 3: Commit** — `git commit -am "feat(web): AI Providers card = Gemini + Higgsfield only"`.

### Task D2: ai-defaults-card → Gemini fixed, video = Higgsfield

**Files:** Modify `apps/web/src/app/dashboard/settings/ai-defaults-card.tsx`

- [ ] **Step 1:** Remove provider pickers (no Claude/OpenAI/Pollinations choice). Caption + Image sections show Gemini fixed with their model dropdowns (`geminiModel`, `geminiImageModel`). Video section: single provider "Higgsfield", enabled when `data.higgsfield?.configured`, else an "add Higgsfield key" hint. Delete `VIDEO_PROVIDER_READY`, the runway/kling/veo model consts, and all preferred-provider mutation calls. `CredsView` keeps `gemini`, `higgsfield`, the two Gemini model fields.

- [ ] **Step 2:** `pnpm --filter @inboudly/web type-check` → clean.

- [ ] **Step 3: Commit** — `git commit -am "feat(web): AI defaults = Gemini fixed + Higgsfield video"`.

---

## Phase E — Validation

### Task E1: Full validation + manual smoke

- [ ] **Step 1: Monorepo type-check** — `pnpm type-check` → all 4 packages clean.
- [ ] **Step 2: API tests** — `pnpm --filter @inboudly/api test` → green.
- [ ] **Step 3: Grep for ghosts** — `rg -n "anthropic|openai|pollinations|elevenLabs|runwayKey|klingKey|veoVideoModel|RunwayVideo|KlingVideo|VeoVideo|DemoVideo" apps packages --glob '!**/node_modules/**'` → only legitimate hits (e.g. `@google/*`, comments). No live wiring to deleted vendors.
- [ ] **Step 4: Boot** — `pnpm dev`; confirm web :3000 + api :3002 start clean (watch for `UnknownDependenciesException`).
- [ ] **Step 5: Manual** — Settings shows only Gemini + Higgsfield. Paste a Gemini key → caption + image generate. Paste a Higgsfield key, generate an image, then animate it → MP4 returns. Try one 中文 caption + one English caption.
- [ ] **Step 6: Commit / open PR** — summarize the manual smoke results (esp. the bilingual check) in the PR body.

---

## Self-Review

**Spec coverage:** "Remove all AI except Gemini" → A2/A4/A5/C1/C2/D1/D2 delete Claude/OpenAI/Pollinations/ElevenLabs/Suno + their keys. "Higgsfield for content" → B1/B2/B4 wire Higgsfield-direct (platform.higgsfield.ai) behind the abstraction. "Smooth + bulletproof" → the `VideoProvider`/resolver seams stay, so providers remain swappable; A1 keeps the moat alive on Gemini embeddings. v1 scope (images+video, defer avatar+voice) → no avatar/voice/TTS tasks; faceless (needs voice) only rewired to compile, recommended hidden from nav in the connector/UX plan.

**Placeholder scan:** the only "verify against live docs" notes are the Higgsfield model id + request fields (B1) and the Gemini `outputDimensionality` option (A1) — both are network-shape confirmations with the real call written, not deferred work.

**Type consistency:** `VideoProviderName='higgsfield'` (C2) matches `VideoProviderSchema=['higgsfield']` (B3) and `provider.name='higgsfield'` (B1) and `adapterFor` (B2). `higgsfieldKey` is consistent across C1/C2/D1. `EmbeddingsService.DIMENSION=3072` (A1) matches the existing Pinecone index.

**Known follow-ups (out of scope, do NOT do here):** connector restructure; avatar+voice + Mandarin TTS (v1.1); generation-first home + compounding-memory UX; hide faceless-videos from nav until voice lands; legal review of Higgsfield ToS before monetizing.
