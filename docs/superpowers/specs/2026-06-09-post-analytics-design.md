# Post Analytics / Insights — Design Spec

**Date:** 2026-06-09 · **Branch:** `feat/phase2b-analytics-pinterest` · **Status:** approved design

## Goal
Pull per-post engagement metrics from connected platforms into `PublicationMetrics`, and surface them on the Analytics dashboard (engagement-over-time + per-post table). Reuses the already-present (unused) `PublicationMetrics`/`AnalyticsSnapshot` models, the `analytics` module/page, and the defined-but-unused `analytics-pull` BullMQ queue.

## Reused (no rebuild)
- `PublicationMetrics` (publicationId, capturedAt, likes/comments/shares/saves/reach/impressions/videoViews/…, `extra` Json) + `AnalyticsSnapshot` Prisma models — present, currently unwritten.
- `analytics` module (`analytics.service.ts`/`analytics.controller.ts` + `/analytics/overview`) + `apps/web/.../dashboard/analytics/page.tsx` (basic).
- `analytics-pull` queue (declared in `scheduler.module.ts`), `ConnectorRegistry`, `PostPublication` (`platformPostId`, `status=SUCCESS`).

## Approach
Extend the connector interface with an **optional** `getPostMetrics`, add an `AnalyticsPullProcessor` that refreshes `PublicationMetrics` for SUCCESS publications via the connector, expose per-post + time-series queries, and render charts on the analytics page (add `recharts`).

## Scope (v1)
- **Live per-platform fetch is parked** (needs connected accounts + each platform's insights API) — same posture as the publishing live tests. We build the full pipeline + **one concrete connector impl (YouTube** `videos.list?part=statistics`**)** as the worked example; other connectors leave `getPostMetrics` unimplemented (optional). The processor + queries + charts are fully testable with mocks/seeded rows now.

## Components
1. **`IPlatformConnector.getPostMetrics?(account, platformPostId): Promise<PostMetrics>`** (`connector.interface.ts`) — `PostMetrics = { likes?, comments?, shares?, saves?, reach?, impressions?, videoViews?, extra? }`. Optional (publish-only connectors omit it).
2. **`YouTubeConnector.getPostMetrics`** — `GET youtube/v3/videos?part=statistics&id={platformPostId}` → map viewCount→videoViews, likeCount→likes, commentCount→comments. (HTTP mocked in tests; live parked.)
3. **`AnalyticsPullProcessor`** (`apps/api/src/modules/analytics/analytics-pull.processor.ts`, BullMQ `analytics-pull`): payload `{ workspaceId }`. For each SUCCESS `PostPublication` with a `platformPostId` whose connector implements `getPostMetrics`, call it (with token-refresh via the existing `ensureUsableAccount`-style guard if expired) → `prisma.publicationMetrics.create` (a new time-stamped snapshot row). Skip connectors without the method. Errors per-publication are logged (message only) + don't abort the batch.
4. **Trigger:** `POST /analytics/refresh` (enqueue a pull for the workspace) + an optional `@Cron` (every 6h) — manual endpoint is the v1 path; cron optional/gated.
5. **`AnalyticsService` queries:** `postMetrics(workspaceId)` — latest `PublicationMetrics` per publication joined to post/variant; `engagementTimeseries(workspaceId, days)` — daily summed engagement for charting.
6. **`AnalyticsController`:** `GET /analytics/posts`, `GET /analytics/timeseries`, `POST /analytics/refresh`.
7. **Web:** add `recharts`; on the analytics page render an **engagement-over-time** line chart (`timeseries`) + a **per-post metrics table** (`posts`), with a **Refresh** button (calls `/analytics/refresh`) + an empty state ("No metrics yet — publish + refresh"). Charts: accessible colors, legend, tooltip, empty-data state (ui-ux-pro-max chart rules).

## Testing (TDD)
- `YouTubeConnector.getPostMetrics` — mocked axios → maps statistics correctly.
- `AnalyticsPullProcessor` — mocked prisma + a mock connector with/without `getPostMetrics`: writes a `PublicationMetrics` row for the implementing connector, skips the others, survives a per-publication error.
- `AnalyticsService.postMetrics`/`engagementTimeseries` — mocked prisma → correct shape/aggregation.

## Out of scope (v1)
Per-connector live insight impls beyond YouTube; account-level `AnalyticsSnapshot` population; per-post drill-down page; CSV export; real-time.
