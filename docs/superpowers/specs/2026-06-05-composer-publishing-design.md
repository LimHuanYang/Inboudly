# Composer → Save Draft / Schedule Post — Design

**Status:** Approved design (brainstorming) — ready for implementation plan.
**Track:** B of 2 (independent of the Pollinations-video track).
**Date:** 2026-06-05

## Goal

Let the Composer turn the current draft (captions + hashtags + attached media, per selected platform) into a real **Post** and either **save it as a draft** or **schedule** it to publish — using the **existing** backend (`POST /posts`, `POST /posts/:id/schedule`, the BullMQ publish worker, and the platform connectors). **Front-end only — no backend changes.**

## Decisions (from brainstorming)

- Scope = **Save draft + Schedule** only. **No** "Request approval" wiring and **no** "Publish now" button (deferred).
- Reuse existing endpoints; do not modify the posts/scheduler/connectors backend.

## Existing seams (reuse — already built and working)

- `POST /api/v1/posts` — body `CreatePostSchema` (`packages/shared/src/schemas.ts`):
  `{ workspaceId, title?, brandVoiceId?, scheduledFor?, campaignTag?, notes?, variants: PostVariantInput[], approvalRequired (default false) }`
  where `PostVariantInput = { platform, caption (≤63206), language (default 'en'), hashtags: string[], mentions: string[], mediaAssetIds: cuid[], platformOptions? }`. Creating a post writes `PostMedia` junction rows for `mediaAssetIds`.
- `POST /api/v1/posts/:id/schedule` — `{ scheduledFor: ISO datetime }` → enqueues the BullMQ `publish` job; at the time, `PublishProcessor` → `ConnectorRegistry.get(platform).publish()` (Instagram/TikTok/RedNote are real).
- `GET /api/v1/social-accounts?workspaceId=…` — connected accounts (status ACTIVE) per platform.
- Composer state (`apps/web/src/app/dashboard/composer/page.tsx`): `selectedPlatforms`, `captions[platform]`, `hashtags[platform]` (raw string), `attachedImageIds[platform]` (= `mediaAssetIds`), `workspaceId`, and the new `attachedAssets` map. TanStack Query + sonner + lucide already in use.

## Architecture (front-end units)

### 1. Draft → payload transform (pure, unit-tested)
New module `apps/web/src/app/dashboard/composer/build-post-input.ts`:
```
buildCreatePostInput(args: {
  workspaceId: string;
  selectedPlatforms: SocialPlatform[];
  captions: Record<SocialPlatform,string>;
  hashtags: Record<SocialPlatform,string>;       // raw " #a #b "
  attachedImageIds: Record<SocialPlatform,string[]>;
}): CreatePostInput
```
- One `variant` per **selected** platform: `{ platform, caption: (captions[p] ?? '').trim(), language:'en', hashtags: parseHashtags(hashtags[p]), mentions: [], mediaAssetIds: attachedImageIds[p] ?? [] }`.
- `parseHashtags(raw)` — split on whitespace, strip a leading `#`, drop empties.
- `approvalRequired: false`. `title` omitted (server allows). Returns a value matching `CreatePostSchema`.

### 2. Mutations (TanStack Query)
- `createPost` → `POST /posts` (body from `buildCreatePostInput`) → returns `{ id }`.
- `schedulePost` → `POST /posts/:id/schedule` `{ scheduledFor }`.
- **Save draft** = `createPost` (status DRAFT). **Schedule** = `createPost` then `schedulePost(id, scheduledFor)`.

### 3. Action bar + schedule panel (UI)
- A footer action bar in the Composer: **`Save draft`** (ghost) + **`Schedule…`** (primary).
- **`Schedule…`** opens a lightweight inline panel (no shadcn Dialog exists — use a conditional absolutely-positioned panel, not a new dependency) with a `datetime-local` input (default = now + 1h) and `Schedule` / `Cancel`. Validate the time is in the future.
- On success: sonner toast ("Draft saved" / "Scheduled for <date>") + a link to `/dashboard/calendar`.

### 4. Account awareness (advisory, non-blocking)
- Query `GET /social-accounts?workspaceId`; derive the set of connected platforms.
- If a selected platform has no connected account, show an inline note near the action bar: *"Connect <platform> in Settings to publish — your draft still saves."* (links to Settings/OAuth). Saving and scheduling remain allowed (the publish worker records per-variant failures); this is guidance, not a hard gate.

### 5. Validation & feedback
- Block (with a message by the action bar) if: no platform selected, OR every selected platform's caption is empty.
- Schedule time must be in the future.
- API errors → `toast.error` with the server message.
- Draft is **not** cleared after save (user can keep editing / re-save).

## Data flow

Composer draft → `buildCreatePostInput` → `POST /posts` (Post + per-platform PostVariant + PostMedia) → **[Save draft]** stops here (DRAFT, visible on Calendar) — or **[Schedule]** → `POST /posts/:id/schedule` → BullMQ `publish` at the time → connectors → live on Instagram/TikTok/RedNote.

## Error handling

- Validation messages inline at the action bar (no platform / empty captions / past time).
- `POST /posts` or `/schedule` failure → toast with the error; the draft is preserved so the user can retry.
- Unconnected platform → advisory inline note; not blocked.

## Testing

- **Unit (TDD):** `buildCreatePostInput` — per-platform variant mapping, `parseHashtags` (strip `#`, split, drop empties), only selected platforms included, attached media carried as `mediaAssetIds`, empty-caption handling.
- **Type-check + build** for the Composer changes.
- **Manual** (testing guide): Save draft → appears on Calendar as DRAFT with media; Schedule → appears scheduled; (with a connected account) it publishes at the time.
- Backend is already covered/working — no new backend tests.

## Scope / YAGNI

Draft + Schedule only. No approval flow, no Publish-now, no multi-step wizard, no backend changes. A future track can add "Publish now" / approval since those pipelines already exist.
