# YouTube Publishing Connector — Design Spec (Phase 2C)

**Date:** 2026-06-08 · **Branch:** `feat/youtube-connector` · **Status:** approved design, pre-plan

## Goal

Extend Inboudly's existing publishing pipeline to **YouTube**: connect a channel via Google OAuth, and publish a post's video to YouTube (Data API v3 `videos.insert`) with a **per-post privacy** choice. This makes Save-draft / Schedule actually publish to YouTube for connected workspaces. No new infrastructure beyond the connector + small wiring.

## Context — what already exists (reused, not rebuilt)

- **`IPlatformConnector`** (`connectors/connector.interface.ts`): `startOauth`, `completeOauth`, `publish`, optional `refreshToken`. `PublishInput = { account, variant + media[] }`, `PublishResult = { platformPostId, platformPostUrl? }`, `OauthTokenSet = { accessToken, refreshToken?, expiresAt?, scopes?, platformUser{id,handle,displayName?,avatarUrl?,extra?} }`.
- **`ConnectorRegistry`** — `Map<SocialPlatform, IPlatformConnector>`; "add a platform = build the connector + register it here."
- **Generic OAuth** (`oauth.controller.ts`): `/oauth/:platform/start|callback` delegate to `registry.get(platform).startOauth/completeOauth`; a small `PLATFORM_FROM_PARAM` map (`{instagram,tiktok,rednote}`) needs `youtube → YOUTUBE`.
- **`SocialAccount`** storage already has `accessToken`, `refreshToken`, `tokenExpiresAt`, `scopes`, `platformUserId`, `meta`; `accounts.upsertFromOauth(...)` persists the callback result.
- **`PostVariant.platformOptions` (`Json?`)** — already intended for per-platform options ("e.g. TikTok privacy"). Per-post YouTube privacy lives at `platformOptions.youtube.privacyStatus`. **No DB migration.**
- **`SocialPlatform` enum + `PLATFORM_SPECS`** already include `YOUTUBE` (`supportsImage:false`, `supportsVideo:true`, video aspect/size/duration). **No metadata work.**
- **BullMQ `publish` processor** → `ConnectorRegistry.get(platform).publish(input)` with retries.

## Approach

**A — raw `axios` + buffer-then-resumable-upload** (chosen). Matches every existing connector (all use raw `axios`); no new heavy deps; sufficient for the short clips Inboudly produces. Streamed/chunked upload for very large files is **deferred** (YAGNI). (Rejected: the official `googleapis` SDK — large dependency + a different idiom than the other connectors.)

## Components / files

- **Create** `apps/api/src/modules/connectors/youtube/youtube.connector.ts` (+ `.spec.ts`) — implements `IPlatformConnector`.
- **Modify** `connectors/connector-registry.service.ts` — inject + register `['YOUTUBE', youtube]`.
- **Modify** `oauth/oauth.controller.ts` — add `youtube: 'YOUTUBE'` to `PLATFORM_FROM_PARAM`.
- **Modify** the Settings connect-accounts UI (`apps/web/src/app/dashboard/settings/page.tsx`) — add `YOUTUBE` to the platform list + the slug map (`YOUTUBE → youtube`).
- **Modify** the Composer (`apps/web/src/app/dashboard/composer/page.tsx`) — a per-post **YouTube settings block** (privacy radiogroup + video-only guard + preview) shown only when YouTube is a selected platform; writes `platformOptions.youtube.privacyStatus` into the `POST /posts` variant.
- **Modify** `packages/shared/src/build-post-input.ts` — thread an optional per-platform `platformOptions` map through `buildCreatePostInput` so the Composer's YouTube privacy reaches the `POST /posts` variant (today it builds variants without `platformOptions`). Pure-function change + a unit test; `CreatePostSchema`/`PostVariantInputSchema` already accept `platformOptions`.
- **Modify** `.env.example` — `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
- **No DB migration.**

## Connector contract

**`startOauth(workspaceId, redirectUri)`** → Google authorize URL:
`https://accounts.google.com/o/oauth2/v2/auth` with `client_id=YOUTUBE_CLIENT_ID`, `redirect_uri`, `response_type=code`, `scope="https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly"`, `access_type=offline`, `prompt=consent` (forces a refresh token), `state="${workspaceId}.${randomHex}"`.

**`completeOauth(code, state, redirectUri)`**:
1. `POST https://oauth2.googleapis.com/token` (`code`, `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`) → `access_token`, `refresh_token`, `expires_in`.
2. `GET https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true` (Bearer access token) → channel `id`, `snippet.title`, `snippet.thumbnails.default.url`.
3. Return `OauthTokenSet { accessToken, refreshToken, expiresAt: now+expires_in, scopes:[upload,readonly], platformUser:{ id: channelId, handle: '@'+title, displayName: title, avatarUrl: thumb, extra:{ channelId } } }`.

**`publish({ account, variant })`**:
1. Pick the first `VIDEO` media asset from `variant.media` (sorted by order). **If none → throw `BadRequestException('YouTube requires a video — image-only posts can't be published to YouTube.')`.**
2. If `account.tokenExpiresAt` is past (or within ~60s) → call `refreshToken(account.refreshToken)` and use the fresh access token for this upload.
3. Build metadata:
   - `snippet.title` = post `title` ?? first non-empty line of caption, trimmed to ≤100 chars (fallback `'Untitled'` if empty).
   - `snippet.description` = caption + (hashtags ? `\n\n`+`#tags` : '').
   - `snippet.tags` = hashtags (deduped, no `#`).
   - `snippet.categoryId` = `'22'` (People & Blogs — safe default).
   - `status.privacyStatus` = `variant.platformOptions?.youtube?.privacyStatus ?? 'unlisted'` (one of `public|unlisted|private`).
4. Resumable upload: `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` with the metadata JSON body + `Authorization: Bearer`, `X-Upload-Content-Type: video/*`, `X-Upload-Content-Length: <bytes>` → read the `Location` header (resumable session URL). Fetch the clip bytes from `mediaAsset.url` (R2) into a Buffer → `PUT` the bytes to the session URL → response JSON `id` = the YouTube video id.
5. Return `{ platformPostId: videoId, platformPostUrl: 'https://youtu.be/'+videoId }`.

**`refreshToken(refreshToken)`**: `POST oauth2.googleapis.com/token` (`grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`) → new `access_token` + `expires_in`; re-`GET channels?mine=true` for `platformUser` (cheap, keeps the return type whole). Returns a full `OauthTokenSet` (the original `refresh_token` is reused — Google doesn't reissue it).

> **Token persistence note:** `publish()` refreshing the token in-memory covers a single upload. Persisting the refreshed token back to `SocialAccount` (so the next job starts fresh) is desirable; the implementation plan will either (a) have `publish` accept a small `onTokenRefreshed` callback the processor uses to update the account, or (b) refresh in the publish processor before dispatch. Decision deferred to the plan; default to (b) — refresh in the processor — as the simpler path that keeps the connector pure.

## UI design (ui-ux-pro-max)

**Surface 1 — Settings → Social accounts · YouTube row.** Reuses the existing connect-row layout (icon · name · status/action) for **consistency**. The **lucide `Youtube`** glyph in a brand-red icon chip (red on the chip only — never a large fill). States:
- *Not connected:* muted "Not connected · video publishing" + a **Connect** button (`aria-label="Connect YouTube"`, ≥40px). Click → opens `/oauth/youtube/start` (popup); on the popup's `postMessage` success → toast + the row flips to connected (`success-feedback`).
- *Connected:* channel avatar + name + a ✓ "Connected" badge (icon **and** text — `color-not-only`) + a **Disconnect** button that **confirms first** (destructive — restoring needs re-OAuth) and shows a loading state while running. A muted helper notes the token auto-refreshes ("connect once").

**Surface 2 — Composer · YouTube settings block** (`progressive-disclosure` — rendered only when YouTube is a selected platform):
- **Privacy** — a **segmented radiogroup** (`role="radiogroup"`, `aria-label="YouTube privacy"`; each option `role="radio"` + `aria-checked`), options **Public / Unlisted / Private**, default **Unlisted**. Arrow-key navigable, each segment ≥44px, selected state by fill+text (not color alone). Writes `platformOptions.youtube.privacyStatus`.
- **Preview** (muted helper text, `input-helper-text` — transparency about what's sent): `Title · "<derived title>"`, `Description · caption + hashtags`, `Tags · from hashtags`.
- **Shorts hint** — informational icon+text: "Vertical & ≤60s → posts as a Short automatically."
- **Video-only guard** — if the post has no video asset: a `role="alert"` message (icon+text, `error-clarity`) "No video attached. YouTube is video-only — attach or generate a clip, or remove YouTube from this post. Your draft still saves." The privacy control stays **active** (the two concerns aren't conflated); only publishing to YouTube is blocked.
- **Quota / failure** — surfaced from the publish job as a readable, retryable message: "YouTube daily upload quota reached (~6/day) — it'll retry, or try again tomorrow."

All interactive elements: visible focus rings, ≥44px touch targets, light/dark parity, lucide icons (consistent stroke).

## Error handling

| Case | Behavior |
|---|---|
| Image-only variant | Connector throws `BadRequest`; Composer shows the video-only `role="alert"` up front. Draft still saves. |
| Access token expired | `refreshToken()` (in the processor) before upload; transparent to the user. |
| Refresh fails (revoked) | Throw → the account shows "reconnect needed"; user re-runs Connect. |
| 403 `quotaExceeded` | Map to a clear "daily upload quota reached (~6/day)" message; job stays queued for retry. |
| Upload / network failure | Throw → existing BullMQ retry handles transient failures. |
| Empty title | Fallback to caption first line, else `'Untitled'` (YouTube requires a non-empty title). |

## Testing

**Unit (mocked `axios` + R2), in `youtube.connector.spec.ts`:**
- `startOauth` → URL contains the upload+readonly scopes, `access_type=offline`, `prompt=consent`, and the `state` prefix.
- `completeOauth` → parses token response + channel identity; captures the refresh token.
- `publish` happy path → video-only asset; resumable init (correct headers/metadata incl. `status.privacyStatus` from `platformOptions`) → PUT bytes → returns `{platformPostId, platformPostUrl: youtu.be/...}`.
- `publish` rejects image-only variant (throws, no HTTP calls).
- privacy default = `unlisted` when `platformOptions` absent.
- `refreshToken` → exchanges refresh token, returns fresh access token + expiry.

**Live verification (parked — needs external setup):** a Google Cloud OAuth app + a real channel; runs like the other paid/external-credential tests (documented, not blocking).

## External setup (documented for the user)

1. Google Cloud project → enable **YouTube Data API v3**.
2. OAuth consent screen (External) + add the `youtube.upload` scope (public/production use needs Google verification; testing works with test users).
3. OAuth **Web** client → `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`; authorized redirect URI = `{NEXT_PUBLIC_API_URL}/api/v1/oauth/youtube/callback`.
4. Default quota ~10,000 units/day; `videos.insert` ≈ 1,600 → ~6 uploads/day.

## Out of scope (v1)

Playlists, custom thumbnails, captions/subtitles, YouTube-native scheduling (we use our own scheduler), chunked upload for very large files, community posts, multi-channel selection (uses the channel the OAuth grants).
