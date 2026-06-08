# Phase 2B Export + Post Analytics + Pinterest — Combined Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Three independent tracks (P/X/A); each task is self-contained.

**Goal:** Ship three independent features on one branch: (P) Pinterest connector, (X) faceless-video MP4 export, (A) post analytics.

**Branch:** `feat/phase2b-analytics-pinterest`. **Specs (authoritative):** `docs/superpowers/specs/2026-06-09-{pinterest-connector,video-mp4-export,post-analytics}-design.md`.

**Build order:** Wave 1 (independent foundations, parallel): P1, X1, A1. Wave 2 (build on wave 1): P2, X2, A2. Wave 3 (web): X3, A3. Then full validation + review.

**Key references:** `connectors/facebook/facebook.connector.ts` + `connector.interface.ts` (P/A); `modules/repurpose/ffmpeg.service.ts` + `repurpose.processor.ts` (X); `scheduler/publish.processor.ts` (X/A processor pattern); `modules/analytics/*` (A); `apps/web/.../dashboard/{videos/[id],analytics}/page.tsx` (X3/A3).

---

## Track P — Pinterest connector

### P1: PinterestConnector (TDD)
**Files:** Create `apps/api/src/modules/connectors/pinterest/pinterest.connector.ts` (+ `.spec.ts`)
- [ ] Implement per the Pinterest spec — model on `facebook.connector.ts`. OAuth (`boards:read,pins:read,pins:write`), `completeOauth` (token endpoint form-body + HTTP Basic client auth + `/v5/user_account`), `publish` (board lookup → `POST /v5/pins` with `image_url` media_source; no-image → BadRequest), `refreshToken`. Env `PINTEREST_CLIENT_ID`/`PINTEREST_CLIENT_SECRET`.
- [ ] ~4 mocked-axios tests (oauth url, completeOauth incl. secret-not-in-query, publish image pin + no-image guard, refresh). Test + type-check green. **No commit, no register.**

### P2: Wire Pinterest
**Files:** Modify `connector-registry.service.ts`, `connectors.module.ts`, `oauth/oauth.controller.ts`, `apps/web/.../settings/page.tsx`, `.env.example`
- [ ] Register `['PINTEREST', pinterest]` (registry + constructor), add to module providers, `pinterest: 'PINTEREST'` in `PLATFORM_FROM_PARAM`, `PINTEREST: 'pinterest'` slug + `'PINTEREST'` in the connect list, env vars (+ redirect-URI comment). Mirror the LinkedIn precedent. type-check (api + web) green. **No commit.**

---

## Track X — Video MP4 export

### X1: FfmpegService.stitchClips (TDD)
**Files:** Modify `apps/api/src/modules/repurpose/ffmpeg.service.ts` (+ its spec)
- [ ] Add `stitchClips(inputPaths: string[], outPath: string): Promise<void>` — fluent-ffmpeg concat (re-encode to uniform H.264/AAC, `+faststart`). Follow the existing `cutAndReframe` style.
- [ ] Unit test with mocked `fluent-ffmpeg` (assert inputs added + concat + output) OR 2 tiny sample clips → output exists. Test + type-check green. **No commit.**

### X2: VideoExportProcessor + exportProject + endpoint (TDD)
**Files:** Create `apps/api/src/modules/videos/video-export.processor.ts` (+ spec); Modify the videos module (queue `video-export` + provider), `faceless-video.service.ts` (`exportProject`), the videos controller (`POST /videos/:id/export`)
- [ ] `exportProject(projectId)` — guard scenes have `videoUrl`, set `exportStatus=GENERATING`, enqueue `video-export`. Register the `video-export` queue **locally in the videos module** (don't edit scheduler.module). Processor: load project+ordered scenes → download clips to temp → `FfmpegService.stitchClips` → upload to R2 (`videos/{projectId}/final-<ts>.mp4`) via MediaService/R2 → set `exportStatus=READY`+`finalUrl`; empty/error → `FAILED`+`errorMessage`.
- [ ] Processor unit test (mock prisma/ffmpeg/storage): orders + stitches + uploads + READY; empty scenes → FAILED. Test + type-check green. **No commit.**

### X3: Web — Export MP4 button + polling
**Files:** Modify `apps/web/src/app/dashboard/videos/[id]/page.tsx`
- [ ] "Export MP4" button (enabled when scenes have `videoUrl` && `exportStatus!=='GENERATING'`) → `POST /videos/:id/export`; poll `exportStatus`; when `READY` show a **Download** link to `finalUrl`; `FAILED` shows the error. Reuse existing polling. type-check green. **No commit.**

---

## Track A — Post analytics

### A1: getPostMetrics interface + YouTube impl (TDD)
**Files:** Modify `connectors/connector.interface.ts` (add optional `getPostMetrics?`), `connectors/youtube/youtube.connector.ts` (+ its spec)
- [ ] Add `getPostMetrics?(account, platformPostId): Promise<PostMetrics>` to the interface (`PostMetrics = { likes?, comments?, shares?, saves?, reach?, impressions?, videoViews?, extra? }`). Implement on `YouTubeConnector`: `GET youtube/v3/videos?part=statistics&id=` → map view/like/comment counts.
- [ ] Mocked-axios test for the YouTube mapping. Test + type-check green. **No commit.**

### A2: AnalyticsPullProcessor + service queries + controller (TDD)
**Files:** Create `apps/api/src/modules/analytics/analytics-pull.processor.ts` (+ spec); Modify `analytics.module.ts` (queue `analytics-pull` + provider), `analytics.service.ts` (`postMetrics`, `engagementTimeseries`), `analytics.controller.ts` (`GET /analytics/posts`, `/timeseries`, `POST /analytics/refresh`)
- [ ] Processor: for each SUCCESS `PostPublication` with `platformPostId` whose connector implements `getPostMetrics`, call it → `prisma.publicationMetrics.create`; skip others; per-publication errors logged (message only), batch continues. Register `analytics-pull` queue locally in analytics.module. Service queries per spec.
- [ ] Processor + service unit tests (mock prisma + a connector with/without getPostMetrics). Test + type-check green. **No commit.**

### A3: Web — analytics charts
**Files:** Modify `apps/web/.../dashboard/analytics/page.tsx`; add `recharts` to `apps/web/package.json`
- [ ] `pnpm --filter @inboudly/web add recharts`. Render an engagement-over-time line chart (`/analytics/timeseries`) + a per-post metrics table (`/analytics/posts`) + a **Refresh** button (`POST /analytics/refresh`) + empty state. Accessible colors, legend, tooltip, empty-data state. type-check green. **No commit.**

---

## Final: validation + review
- [ ] Stop dev servers; full API suite + api/web type-check + api/web build → green (expect new connector + ffmpeg + analytics tests passing). Then final whole-branch review + merge.

## Self-Review
**Coverage:** Pinterest (P1-P2) ✓; export (X1-X3) ✓; analytics (A1-A3) ✓. Each track is independent (disjoint modules) → wave-parallelizable. Queues registered locally per module (no scheduler.module contention). Live tests parked (Pinterest OAuth app; real platform metrics) per specs. **Types:** `PINTEREST`/`pinterest` consistent across registry/oauth/settings; `getPostMetrics`/`PostMetrics` consistent interface↔YouTube↔processor; `exportStatus`/`finalUrl` already in schema.
