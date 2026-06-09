# Upload Own Image/Video — Implementation Plan

> superpowers:subagent-driven-development. **Frontend-only** — the presigned-upload backend already exists. Branch: `feat/upload-own-media`.

**Goal:** Let users upload their own image/video files and (a) attach them to a post in the Composer, (b) add them to the Media library. Per-platform validation (PLATFORM_SPECS).

**Existing backend (no changes):**
- `POST /api/v1/media/upload-url` body `{ workspaceId, filename, mimeType }` → `{ uploadUrl, key, publicUrl }` (presigned R2 PUT, 600s).
- Client `PUT`s the file bytes to `uploadUrl` with header `Content-Type: <mimeType>` (direct to R2).
- `POST /api/v1/media` body `{ workspaceId, type, source:'UPLOAD', url:publicUrl, filename, mimeType, sizeBytes, width?, height?, durationSec? }` → registers + returns the `MediaAsset` (`{ id, url, type, ... }`).
- `GET /api/v1/media?workspaceId=` lists assets (Media library; key `['media', workspaceId]`).
- `MediaType = IMAGE|VIDEO|AUDIO|GIF`; `MediaSource` has `UPLOAD`.

**Composer attach (reuse, `composer/page.tsx`):** `attachedImageIds: Record<platform, string[]>` (asset ids) + `attachedAssets: Record<id,{url,type:'image'|'video'}>`; `toggleAttachImage`/`removeAttached`; ids flow via `buildCreatePostInput({ attachedImageIds })` → `mediaAssetIds`.

---

## U1: Upload helper + validator + meta extractor (shared lib)
**File:** Create `apps/web/src/lib/upload.ts`
- [ ] Read `@/lib/api-client` (the `api` client + `request`), and `packages/shared/src/platforms.ts` `PLATFORM_SPECS` for the EXACT field names (max image/video bytes, max video duration secs, allowed formats/mime, aspect ratios).
- [ ] `export interface UploadedAsset { id: string; url: string; type: 'IMAGE'|'VIDEO'; filename: string }` (mirror the `POST /media` response subset used by callers).
- [ ] `export async function extractMediaMeta(file: File): Promise<{ type: 'IMAGE'|'VIDEO'; width?: number; height?: number; durationSec?: number }>` — image/* → load via `Image()` (naturalWidth/Height); video/* → a hidden `<video>` `loadedmetadata` (videoWidth/Height/duration); revoke object URLs. Throw if not image/video.
- [ ] `export function validateForPlatform(file: File, meta, platform: SocialPlatform): { ok: boolean; error?: string }` — using `PLATFORM_SPECS[platform]`: check the MIME is an allowed format; `file.size` ≤ the spec's max for that media type; for video, `meta.durationSec` ≤ the spec's max duration. Return a specific message (e.g. `"Video is 95s — TikTok allows up to 600s"`, `"Image is 41MB — Instagram allows up to 30MB"`). Also `export function validateBasic(file): {ok,error?}` (type is image/* or video/* + a sane global cap, for the library where there's no platform).
- [ ] `export async function uploadFile(opts: { workspaceId: string; file: File; onProgress?: (pct: number) => void }): Promise<UploadedAsset>`:
  1. `extractMediaMeta(file)`.
  2. `api.post<{ uploadUrl; key; publicUrl }>('/media/upload-url', { workspaceId, filename: file.name, mimeType: file.type })`.
  3. PUT the file to `uploadUrl` with `XMLHttpRequest` (so `onProgress` works via `upload.onprogress`) + header `Content-Type: file.type`; reject on non-2xx.
  4. `api.post<UploadedAsset>('/media', { workspaceId, type: meta.type, source: 'UPLOAD', url: publicUrl, filename: file.name, mimeType: file.type, sizeBytes: file.size, width: meta.width, height: meta.height, durationSec: meta.durationSec })`.
  5. return the registered asset.
- [ ] `pnpm --filter @inboudly/web type-check` clean. **No commit.**

## U2: Composer upload (attach own file)
**File:** Modify `apps/web/src/app/dashboard/composer/page.tsx`
- [ ] In the "Generate with AI" area, add an **Upload** affordance (a button + hidden `<input type="file" accept="image/*,video/*">`, ideally with drag-and-drop on a small dropzone). On file pick:
  - `extractMediaMeta` + `validateForPlatform(file, meta, activePlatform)`; if `!ok` → `toast.error(error)` and stop.
  - `uploadFile({ workspaceId, file, onProgress })` with an inline progress indicator (disable the control while uploading).
  - On success → attach to the active platform: push `asset.id` into `attachedImageIds[activePlatform]` + set `attachedAssets[asset.id] = { url: asset.url, type: asset.type === 'VIDEO' ? 'video' : 'image' }` (reuse the exact pattern AI media uses). Toast "Uploaded & attached".
- [ ] Respect the existing per-platform video-only / attach rules already in the file (e.g. the YouTube video-only guard). type-check clean. **No commit.**

## U3: Media library upload
**File:** Modify `apps/web/src/app/dashboard/media/page.tsx`
- [ ] Add an **Upload** button in the header + hidden file input (`image/*,video/*`). On pick: `validateBasic(file)` (no platform context here) → `uploadFile({ workspaceId, file, onProgress })` with a small progress/toast → on success `toast.success` + `queryClient.invalidateQueries({ queryKey: ['media', workspaceId] })`. Show an uploading state.
- [ ] type-check clean. **No commit.**

## U4: Validation + review + merge
- [ ] `pnpm --filter @inboudly/web type-check` clean. (Do NOT run `build` — dev server is live.) Final review → merge.

## Self-Review
Frontend-only (no api/db/shared edits). U1 is the shared core (upload + validate + meta); U2/U3 consume it (parallel after U1, disjoint pages). Per-platform validation in Composer (active platform), basic validation in library (no platform). Reuses the existing presigned endpoints + the Composer attach state. `source:'UPLOAD'` + `type` IMAGE/VIDEO match the schema enums.
