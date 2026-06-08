# Video MP4 Export (Phase 2B) — Design Spec

**Date:** 2026-06-09 · **Branch:** `feat/phase2b-analytics-pinterest` · **Status:** approved design

## Goal
Stitch a faceless-video project's per-scene clips into one downloadable MP4. Reuses the existing `VideoProject`/`VideoScene` schema (which already has `exportStatus` + `finalUrl`), the existing `fluent-ffmpeg` + `FfmpegService`, the BullMQ job pattern, and R2 storage.

## Reused (no rebuild)
- `FfmpegService` (`apps/api/src/modules/repurpose/ffmpeg.service.ts`) — already does H.264/AAC encoding via `fluent-ffmpeg`.
- `VideoProject` (`exportStatus`, `finalUrl`, `durationSec`) + `VideoScene` (`order`, `videoUrl`) Prisma models — already present.
- BullMQ (`RepurposeProcessor` pattern), `MediaService`/`R2StorageService` (R2 upload + public URL), the `videos/[id]` page + Generations tray polling.

## Approach
Add a `stitchScenes` capability to `FfmpegService`, a `video-export` BullMQ processor that downloads each scene clip → stitches → uploads the final MP4 to R2 → updates the project, a service method + endpoint to enqueue it, and an "Export MP4" button + polling on the project page.

## Scope (v1)
- Stitches the project's `VideoScene.videoUrl` clips **in `order`** into one MP4. (Generating the per-scene clips is a separate, out-of-scope concern; export stitches whatever `videoUrl`s are present.)
- Concatenation via ffmpeg `concat` demuxer (re-encode to a uniform H.264/AAC so mismatched inputs concatenate cleanly).
- Single project export at a time; no transitions/music (future).

## Components
1. **`FfmpegService.stitchClips(inputPaths: string[], outPath: string): Promise<void>`** — concat-demuxer (or `filter_complex concat`) → one H.264/AAC MP4, `+faststart`. Pure ffmpeg orchestration.
2. **`VideoExportProcessor`** (`apps/api/src/modules/videos/video-export.processor.ts`, BullMQ `video-export`): payload `{ projectId }`. Loads the project + scenes (ordered, `videoUrl` non-null); if none → fail with a clear message. Downloads each clip to a temp dir, calls `stitchClips`, uploads the result to R2 (`videos/{projectId}/final-<ts>.mp4`) via `MediaService`/`R2StorageService`, sets `exportStatus = READY` + `finalUrl`; on error sets `exportStatus = FAILED` + `errorMessage`.
3. **`FacelessVideoService.exportProject(projectId)`** — guard (scenes have video), set `exportStatus = GENERATING`, enqueue the job. Register the `video-export` queue (scheduler/videos module) — gated behind queues like the others.
4. **API:** `POST /videos/:id/export` (auth + workspace guard) → `exportProject`.
5. **Web:** an **"Export MP4"** button on `apps/web/src/app/dashboard/videos/[id]/page.tsx` (enabled when scenes have `videoUrl` + `exportStatus !== GENERATING`); poll `exportStatus`; when `READY`, show a **Download** link to `finalUrl`. Reuse the existing polling/tray pattern.

## Testing (TDD)
- `FfmpegService.stitchClips` — unit test with 2 tiny sample clips (or a mocked `fluent-ffmpeg` command builder asserting concat + output args); verify it produces an output file / issues the right ffmpeg invocation.
- `VideoExportProcessor` — unit test with mocked prisma + ffmpeg + storage: orders scenes, calls stitch, uploads, sets `READY`; empty-scenes → `FAILED` with message.

## Out of scope (v1)
Per-scene video generation; transitions, background music, captions overlay; multi-project batch; client-side export.
