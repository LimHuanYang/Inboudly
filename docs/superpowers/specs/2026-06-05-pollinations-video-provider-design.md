# Real Video Generation via Pollinations (BYOK) — Design

**Status:** Approved design (brainstorming) — ready for implementation plan.
**Track:** A of 2 (independent of the Composer-publishing track).
**Date:** 2026-06-05

## Goal

Replace the Demo-only video path with a real, prompt-driven **Pollinations** provider (BYOK key + pay-as-you-go credits), plugged into the existing `VideoProvider` seam. Demo stays as the always-works, no-key fallback.

## Decisions (from brainstorming)

- **Provider:** Pollinations, BYOK. A single encrypted `pollinationsKey` unlocks its video models (`seedance` / `veo` / `wan-fast`) via `gen.pollinations.ai`. Not free/keyless anymore — pay-as-you-go "Pollen" credits.
- **Runner:** keep the existing **in-process detached** runner (`void this.run()`), and add a **stale-job safety net** (a scheduled sweep that fails jobs stuck in GENERATING beyond a timeout) to cover process restarts / provider hangs. No BullMQ queue for now.
- **Out of scope:** Runway, Kling, direct Veo adapters (their key slots remain pre-wired but unimplemented).

## Existing seams (reuse — do not rebuild)

- `apps/api/src/modules/ai/video/video-provider.interface.ts` — `VideoProvider { name; generate(apiKey, params): Promise<{ asset:{id,url}, model }> }`.
- `apps/api/src/modules/ai/video/video-generation.service.ts` — `adapterFor()` dispatch + detached `run()` + `create/get/list`.
- `apps/api/src/modules/ai-credentials/ai-credentials.service.ts` — `resolveVideoProvider`, `IMPLEMENTED_VIDEO_PROVIDERS`, `keyFieldFor`, `getVideoModel`, `AiProviderKeyName`, `KEY_FIELDS`, `AiCredentialsView`.
- `apps/api/src/modules/ai-credentials/ai-credentials.controller.ts` — `ALLOWED_KEY_FIELDS`, `:provider/test`.
- `apps/api/src/modules/media/{media.service.ts,r2-storage.service.ts}` — `MediaService.register(...)`, `R2StorageService.putObject(key, buf, contentType)` (both exported by MediaModule).
- `apps/api/src/modules/ai/pollinations-image.service.ts` — pattern reference for a Pollinations adapter (note: image is keyless; **video is keyed**).
- Settings: the BYOK key cards ("AI integrations" on the settings page) and `AiDefaultsCard` video provider/model block (`VIDEO_PROVIDER_READY.pollinations` currently `false`).
- `@nestjs/schedule` is already a dependency (for the stale-job sweep).

## Architecture (units)

### 1. Credentials — add a keyed Pollinations
- **Prisma:** add `pollinationsKey String? @db.Text` to `WorkspaceAiCredentials`. `pnpm db:push && pnpm db:generate`.
- **AiCredentialsService:**
  - Add `'pollinationsKey'` to `AiProviderKeyName` + `KEY_FIELDS`.
  - `keyFieldFor.pollinations = 'pollinationsKey'`.
  - `resolveVideoProvider`: remove the keyless special-case for `pollinations` — it now resolves only when `pollinationsKey` is present (same path as runway/kling). Add `'pollinations'` to `IMPLEMENTED_VIDEO_PROVIDERS` (so `['demo','pollinations']`).
  - `AiCredentialsView`: add a `pollinations: { configured, masked }` provider state; `view()` returns it via the existing `safeKey('pollinationsKey')` helper.
- **AiCredentialsController:** add `'pollinationsKey'` to `ALLOWED_KEY_FIELDS`. (Optional: a `pollinations` case in `:provider/test` — deferred; not required for MVP.)

### 2. `PollinationsVideoProvider`
New file `apps/api/src/modules/ai/video/pollinations-video.provider.ts`, `@Injectable()`, implements `VideoProvider`, `name = 'pollinations'`, constructor injects `MediaService` + `R2StorageService`.

`generate(apiKey, params)`:
1. Call `gen.pollinations.ai` text→video with `{ prompt, model: params.model, durationSec, aspectRatio }` and `Authorization: Bearer <apiKey>`.
2. Obtain the final video (sync long response, or poll a returned job id until ready — see Open Questions).
3. Download the video bytes; `R2StorageService.putObject('videos/pollinations/<cuid>.mp4', buf, 'video/mp4')` → durable URL.
4. `MediaService.register({ workspaceId, type: VIDEO, source: AI_GENERATED, url: <r2Url>, filename, mimeType:'video/mp4', sizeBytes: buf.length, durationSec: params.durationSec, aiPrompt: params.prompt, aiModel: params.model, aiCostUsd?: <if returned> })`.
5. Return `{ asset: { id, url }, model: params.model }`.
6. On any failure throw — `run()`'s try/catch records the job `FAILED` with a friendly message.

### 3. Wire-up
- `VideoGenerationService.adapterFor()`: `case 'pollinations': return this.pollinations;`. Inject `PollinationsVideoProvider`.
- `AiModule`: add `PollinationsVideoProvider` to `providers` (MediaModule already provides `MediaService` + `R2StorageService`).

### 4. Stale-job safety net
A `@Cron` sweep (every ~2 min) in a small unit (e.g. `VideoGenerationService.reapStaleJobs()` or a dedicated provider): `videoGeneration.updateMany({ where: { status: GENERATING, updatedAt < now - STALE_MS }, data: { status: FAILED, errorMessage: 'Generation timed out.' } })`. `STALE_MS` ≈ 10 min (longer than the slowest expected clip). Register `ScheduleModule.forRoot()` if not already; add the cron method.

### 5. Settings UI
- Add a **Pollinations** BYOK key card (input + Save/Clear) to the settings "AI integrations" key cards (mirrors the Anthropic/OpenAI cards; `field = 'pollinationsKey'`), with helper text: "Get a key + add credit at pollinations.ai".
- `AiDefaultsCard`: set `VIDEO_PROVIDER_READY.pollinations = true`; Pollinations video model options = `seedance-1` / `veo-alpha` / `wan-fast` (free-form, so additive). Update the "Only Demo is active" note accordingly.
- `CredsView` (web): add `pollinations` provider state so the provider dropdown can gate Pollinations on `pollinations.configured`.

### 6. Shared schema
`GenerateVideoSchema.model` is already a free-form string and `VideoProviderSchema` already includes `'pollinations'` — no schema change needed.

## Data flow

Composer (prompt) → `POST /ai/video` → `VideoGenerationService.create` → `resolveVideoProvider` (→ `pollinations` + decrypted `pollinationsKey`, else falls back to `demo`) → job `GENERATING` → detached `run()` → `PollinationsVideoProvider.generate(key)` → `gen.pollinations.ai` → video bytes → **R2** → `MediaService.register` → job `READY` + `mediaAssetId` → frontend polls `GET /ai/video/:id`.

## Error handling

- No `pollinationsKey` while `pollinations` is preferred → `resolveVideoProvider` falls back to `demo` (never throws). The Settings dropdown also gates Pollinations on a saved key.
- API error / bad key / no credits → job `FAILED`, message: *"Pollinations couldn't generate the video — check your API key and credit balance in Settings."*
- Orphaned/hung `GENERATING` jobs → stale-job sweep marks them `FAILED` after the timeout.

## Testing

- **Unit (TDD where cheap):**
  - `PollinationsVideoProvider` — request building + response parsing + R2/register calls, with `fetch`, `R2StorageService`, and `MediaService` mocked. (No real network.)
  - `resolveVideoProvider` — update the existing spec: `pollinations` now requires `pollinationsKey`; with a key it resolves to pollinations, without it falls back to demo; `IMPLEMENTED_VIDEO_PROVIDERS` includes pollinations.
  - Stale-job sweep — marks an old GENERATING row FAILED, leaves a fresh one.
- **Type-check + build** for wiring; **boot smoke** for DI.
- **Manual** (testing guide): with a real Pollinations key + credit, generate → real clip in tray/composer/media.
- **First implementation task = verify the live Pollinations video API** (endpoint, auth header, sync-vs-async/poll, response shape, cost field), since their public docs lag; adapt the adapter to reality.

## Open questions (resolve during implementation, task #1)

- Exact `gen.pollinations.ai` text→video contract: request method/params, `Authorization` scheme, whether it returns the video synchronously, a hosted URL, or a job id to poll; and whether a per-request `aiCostUsd` is returned. The adapter is structured so only the `generate()` internals change once verified.

## Scope / YAGNI

Pollinations only. Demo retained as fallback. In-process runner + reaper (no queue). No provider "test" ping (optional later). No Runway/Kling/Veo.
