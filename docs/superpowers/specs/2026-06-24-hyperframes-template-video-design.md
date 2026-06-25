# HyperFrames Template-Video — Design Spec (Track B v1)

> Status: **approved design, 2026-06-24.** Scope of this spec = **v1 = phases B0–B2** (standalone branded clips). B3 (chaining on Higgsfield) is explicitly out of scope here and gets its own spec later.

## Goal

Add **HyperFrames** as a second video engine in Inboudly: render deterministic, on-brand MP4 "branded clips" from bundled HTML templates filled with the workspace's BrandKit + a post's text, then attach the result to a post like any other media. HyperFrames is free, local, and deterministic — complementary to Higgsfield (AI-generative, paid, probabilistic), not a replacement.

## Non-goals (v1)

- **Chaining on Higgsfield footage** (Higgsfield clip as the moving background under a HyperFrames overlay). Deferred to B3 — needs the standalone renderer first.
- **A BYOK key for HyperFrames.** It runs locally; there is no API key and no `WorkspaceAiCredentials` field for it.
- **User-authored templates / a template editor.** v1 ships two fixed templates.
- **A model-override UI.** `model` is fixed to the template id.

## Key facts grounding the design (from the live pipeline map)

The existing video pipeline is **provider-agnostic** below the render call. Confirmed shapes:

- `VideoProvider` interface: `name: string; generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult>` where `VideoGenerateParams = { workspaceId, prompt, durationSec, aspectRatio, model, referenceImageUrl? }` and `VideoGenerateResult = { asset: { id, url }, model }`.
- `VideoGenerationService.create()` → creates a `VideoGeneration` row (status `GENERATING`), fires `void this.run(jobId, apiKey)` detached, returns immediately. `run()` calls `adapterFor(job.provider).generate(...)`, then updates the row to `READY` + `mediaAssetId` or `FAILED` + `errorMessage`. `@Cron('*/2 * * * *') reapStaleJobs()` fails `GENERATING` rows older than 10 min.
- `R2StorageService.putObject(key, buffer, contentType): Promise<string>` → public URL.
- `MediaService.register({ workspaceId, type, source, url, filename, mimeType, sizeBytes, width?, height?, durationSec?, aiPrompt?, aiModel? }): Promise<MediaAsset>`.
- `BrandKit`: `primaryColor`, `secondaryColor?`, `accentColor?`, `fontFamily?`, `logoUrl?`, `logoLightUrl?`, `logoDarkUrl?`, `isDefault`.
- HyperFrames render primitive: a composition declares `data-composition-variables` on `<html>`; `npx hyperframes render --variables '{…}' --output out.mp4` injects values per render. Deterministic: identical input → identical MP4.

## Decisions

- **D1 — Render via the CLI.** Shell out: `execFile('npx', ['hyperframes', 'render', '--variables', json, '--quality', 'standard', '--output', tmpMp4])`. No in-process `@hyperframes/producer` dependency. Matches the installed skills, isolates the heavy render in a child process.
- **D2 — Reuse `VideoGeneration`.** Add two additive nullable fields: `templateId String?`, `variables Json?`. `provider = 'hyperframes'`, `model = templateId`, `referenceImageUrl = null`. The runner, cron reaper, `GET /ai/video/:id` polling, and `GenerationsTray` are reused unchanged.
- **D3 — Two bundled templates** in the API package, each a HyperFrames composition project declaring `data-composition-variables`.

## Architecture

```
POST /ai/template-video
  → VideoGenerationService.createTemplateJob(input)
      builds variables = brandToVariables(defaultBrandKit) ⊕ text fields ⊕ size(aspectRatio)
      cache: hash(templateId + variables) → reuse prior READY mediaAssetId if present
      else: videoGeneration.create({ provider:'hyperframes', model:templateId, templateId, variables, status:GENERATING })
            void run(jobId)        // detached, reused
  → run() → adapterFor('hyperframes') → HyperframesVideoProvider.generate('', params)
      copy template project → os.tmpdir()/hf-<uuid>/
      write nothing else; render with --variables (from params.variables) --output tmp.mp4
      read buffer → r2.putObject('videos/hyperframes/<uuid>.mp4', buf, 'video/mp4')
      media.register({ type:VIDEO, source:AI_GENERATED, url, width, height, durationSec, aiModel:'hyperframes:'+templateId })
      cleanup tmp dir
      return { asset:{id,url}, model:'hyperframes' }
  → job READY + mediaAssetId   (reused)
  → composer attaches asset → PostMedia → cron → connectors publish   (untouched)
```

## Components (file → responsibility)

### Backend (NestJS)

- **Create:** `apps/api/src/modules/ai/video/hyperframes-video.provider.ts` — `HyperframesVideoProvider implements VideoProvider`. `name = 'hyperframes'`. `generate(_apiKey, params)`:
  1. Validate `params.templateId` is a known template and required variables are present (throw `BadRequestException` otherwise).
  2. `renderToBuffer(templateId, variables)` — copy the template project dir to a fresh temp dir, run the CLI via `execFile` with a timeout (e.g. 4 min), on non-zero exit throw `Error` with captured stderr tail.
  3. Read the MP4 buffer, `r2.putObject(...)`, `media.register(...)`, return `{ asset, model }`. `finally` → remove the temp dir.
  - Injects `R2StorageService`, `MediaService`. No credential dependency.
- **Create:** `apps/api/src/modules/ai/video/template-video/templates/` — two composition projects:
  - `bilingual-caption/` — variables: `brand_primary`, `brand_accent`, `brand_font`, `logo_url`, `caption_en`, `caption_zh`, `background_url?`, `width`, `height`, `duration`. Renders a caption clip with EN + 中文 lines over `background_url` (or a brand-colored card if absent).
  - `launch/` — variables: `brand_primary`, `brand_accent`, `brand_font`, `logo_url`, `title`, `cta`, `background_url?`, `width`, `height`, `duration`. Renders a "new drop" headline + CTA card.
  - A small `index.ts` registry: `TEMPLATES: Record<string, { dir: string; required: string[]; defaultDurationSec: number }>`.
- **Create:** `apps/api/src/modules/ai/video/template-video/brand-to-variables.ts` — `brandToVariables(kit: BrandKit | null): Partial<Variables>` mapping `primaryColor→brand_primary`, `accentColor ?? secondaryColor→brand_accent`, `fontFamily→brand_font` (fallback to a safe default), `logoUrl ?? logoLightUrl→logo_url`. Pure function — **unit tested**.
- **Create:** `apps/api/src/modules/ai/video/template-video/size-for-aspect.ts` — `sizeForAspect('9:16'|'1:1'|'16:9') → { width, height }` (1080×1920 / 1080×1080 / 1920×1080). Pure — **unit tested**.
- **Modify:** `apps/api/src/modules/ai/video/video-provider.interface.ts` — extend `VideoGenerateParams` with optional `templateId?: string` and `variables?: Record<string, string | number>`.
- **Modify:** `apps/api/src/modules/ai/video/video-generation.service.ts` — add `createTemplateJob(input)` (builds variables, runs the cache check, creates the row with `provider:'hyperframes'`, detaches `run`); `adapterFor()` gains `case 'hyperframes': return this.hyperframes`; constructor injects `HyperframesVideoProvider`; `run()` passes `templateId`/`variables` through to `generate`.
- **Modify:** `apps/api/src/modules/ai/video/video-generation.controller.ts` — `POST /ai/template-video` (body: `{ workspaceId, templateId, aspectRatio, caption?, captionZh?, title?, cta?, backgroundUrl? }`), guarded by `SupabaseAuthGuard` + `workspaces.assertMember`. Reuse `GET /ai/video/:id` for polling.
- **Modify:** `apps/api/src/modules/ai-credentials/ai-credentials.service.ts` — `'hyperframes'` added to `VideoProviderName` and `IMPLEMENTED_VIDEO_PROVIDERS` (so it's a recognized provider). No key resolution for it.
- **Modify:** `packages/shared/src/schemas.ts` — a `CreateTemplateVideoSchema` (Zod) for the new endpoint; `VideoProviderSchema` enum += `'hyperframes'`.
- **Modify:** `apps/api/src/modules/ai/ai.module.ts` — register `HyperframesVideoProvider`.
- **Modify:** `packages/database/prisma/schema.prisma` — `VideoGeneration` += `templateId String?`, `variables Json?`. One additive migration.
- **Determinism cache:** in `createTemplateJob`, compute `hash = sha256(templateId + stableStringify(variables))` and store it inside the row's `variables` under a reserved `__hash` key. Before rendering, load the workspace's recent `READY` hyperframes rows (e.g. last 50, `mediaAssetId != null`) and compare their `variables.__hash`; on a match, create the new row already `READY` pointing at the same `mediaAssetId` (no render). App-side comparison avoids JSON-path queries; a dedicated indexed `renderHash` column is a later optimization.

### Frontend (Next.js)

- **Modify:** `apps/web/src/app/dashboard/composer/page.tsx` — a "Branded clip" card alongside the existing image/video modes: pick a template (Bilingual caption / Launch); prefill `caption_en` from a non-RedNote variant's caption and `caption_zh` from the RedNote variant's caption (each editable in the card; a missing language is left blank — auto-translation is out of scope for v1); pick the platform size (defaults from the active platform); **Generate** → `POST /ai/template-video`; poll `GET /ai/video/:id` (reuse the existing video-job polling + `GenerationsTray`); on `READY` attach the `mediaAsset` to the active platform exactly like a Higgsfield video.

## Render invocation details

- Command: `npx hyperframes render --variables <json> --quality standard --format mp4 --output <tmp>.mp4` run from the copied template dir. `execFile` (not `exec`) to avoid shell injection; pass the JSON as a single argv.
- Timeout: 4 min hard kill; the existing 2-min/10-min reaper is the backstop for orphaned `GENERATING` rows. (Renders for short branded clips are expected < 60 s.)
- Temp dirs under `os.tmpdir()`, removed in `finally`.
- Errors: non-zero exit → `Error('HyperFrames render failed: ' + stderrTail)`, surfaced to the job's `errorMessage` and shown in the UI. Missing Chromium/FFmpeg → actionable message pointing at `npx hyperframes doctor`.

## Environment / ops

- Requires **Node 22+** (dev box has 24), **FFmpeg** (present), and **headless Chromium** (installed via `npx hyperframes browser`). Add these to the API/worker deploy image. A `hyperframes doctor` check at boot (warn-only) surfaces a missing dependency early.

## Testing strategy

- **Unit (TDD):** `brand-to-variables.ts` (mapping + fallbacks), `size-for-aspect.ts`, the template registry's required-variable validation, and the cache hash/stable-stringify. Mock the CLI in the provider test (assert the argv + that a buffer→R2→register chain runs); do **not** run a real render in unit tests.
- **Spike (B0):** a throwaway script that renders the bilingual-caption template with a real BrandKit's colors to prove the CLI runs in this environment (Chromium + FFmpeg).
- **Pre-merge:** the adversarial multi-agent review used on Tracks A & the publishing UI, before merging each phase.

## Phasing

| Phase | Deliverable | In v1? |
|---|---|---|
| **B0 Spike** | render bilingual-caption with real brand colors → MP4 via CLI in the API env | yes |
| **B1 Engine** | provider + 2 templates + brand-to-variables + size-for-aspect + endpoint + DB fields + cache + unit tests | yes |
| **B2 Composer** | "Branded clip" card + per-platform sizing + polling/tray reuse | yes |
| **B3 Chaining** | Higgsfield footage as background under a webm-transparency overlay | **no — separate spec** |

## Risks / watch-outs

- **Render CPU cost** — frame-by-frame is heavy. Mitigated by async detached runner + the determinism cache (identical input is never re-rendered).
- **CLI availability in the runtime** — `npx hyperframes` must resolve in the API process env; bundle/install in the deploy image (not just the dev box).
- **Temp-dir leakage** — always clean up in `finally`; the spike confirms disk behavior.
- **Large buffers in memory** — v1 short clips are small; if clips grow, stream to R2 instead of buffering. Out of scope for v1.
