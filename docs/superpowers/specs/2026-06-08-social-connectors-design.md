# Facebook + LinkedIn Publishing Connectors — Design Spec

**Date:** 2026-06-08 · **Branch:** `feat/social-connectors` · **Status:** approved design

## Goal
Add two publishing connectors behind the existing `IPlatformConnector` seam: **Facebook** (Page posting via Meta Graph) and **LinkedIn** (member posting). Same proven pattern as the YouTube connector — register + generic OAuth route + connect-row UI — so a workspace can connect these and publish. They inherit the just-shipped token-refresh + `PENDING_REAUTH` reconnect flow for free.

## Reused (no rebuild)
- `IPlatformConnector` (`startOauth`/`completeOauth`/`publish`/`refreshToken?`), `ConnectorRegistry`, the generic `/oauth/:platform/*` controller (+ its `PLATFORM_FROM_PARAM` map), `SocialAccount` storage (`accessToken`/`refreshToken`/`tokenExpiresAt`/`status`/`platformUserId`/`meta`), the BullMQ `publish` processor (now refreshes expiring tokens before publishing), and the Settings connect rows + 3 states.
- `SocialPlatform` enum + `PLATFORM_SPECS` already include `FACEBOOK` + `LINKEDIN`. **No DB migration.**

## Approach
Two new `IPlatformConnector` implementations (raw `axios`, no DI deps — like the Instagram/YouTube connectors). **FacebookConnector models directly on the existing `InstagramConnector`** (same Meta Graph API + FB OAuth dialog). **LinkedInConnector** uses LinkedIn OAuth 2.0 + the Posts API. v1 scope keeps media minimal where the API is fiddly (see per-connector notes). Implementers must verify exact endpoints/scopes against current platform docs (the live test is parked until OAuth apps exist).

## FacebookConnector (`connectors/facebook/facebook.connector.ts`)
- `platform = 'FACEBOOK'`.
- **startOauth:** FB OAuth dialog (`https://www.facebook.com/v21.0/dialog/oauth`), `client_id = FACEBOOK_APP_ID`, scopes `pages_show_list,pages_manage_posts,pages_read_engagement`, `state = "${workspaceId}.<hex>"`. (Same Meta app may serve IG + FB; use a dedicated `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` for clarity.)
- **completeOauth:** exchange code → short-lived token → `fb_exchange_token` → long-lived token → `GET /me/accounts` → pick the first Page → store the **page access token** + page id (mirror `InstagramConnector.completeOauth`). `platformUser` = { id: pageId, handle: page.name, displayName: page.name, extra: { pageId } }.
- **publish:** to `account.platformUserId` (the page id) with the page token:
  - text-only → `POST /{page-id}/feed` (`message`).
  - single image → `POST /{page-id}/photos` (`url` + `caption`).
  - video → `POST /{page-id}/videos` (`file_url` + `description`).
  - Caption = caption + hashtags. Return `{ platformPostId, platformPostUrl: https://facebook.com/<id> }`.
- **refreshToken:** `fb_exchange_token` to extend the long-lived token (mirror IG token handling).
- v1: posts to the **first** managed Page (no multi-page picker).

## LinkedInConnector (`connectors/linkedin/linkedin.connector.ts`)
- `platform = 'LINKEDIN'`.
- **startOauth:** `https://www.linkedin.com/oauth/v2/authorization`, `client_id = LINKEDIN_CLIENT_ID`, `response_type=code`, scopes `openid profile w_member_social`, `state`.
- **completeOauth:** `POST https://www.linkedin.com/oauth/v2/accessToken` (form body: code, client_id, client_secret, redirect_uri, grant_type=authorization_code) → `access_token` (+ `refresh_token` if the app has the program; `expires_in`). `GET https://api.linkedin.com/v2/userinfo` → `sub` (member id), `name`, `picture`. `platformUser` = { id: sub, handle: name, displayName: name, avatarUrl: picture, extra: { personUrn: `urn:li:person:${sub}` } }.
- **publish:** `POST https://api.linkedin.com/rest/posts` (headers `Authorization: Bearer`, `LinkedIn-Version: 202401`, `X-Restli-Protocol-Version: 2.0.0`) with body `{ author: personUrn, commentary: caption+hashtags, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED' }, lifecycleState: 'PUBLISHED' }`. **v1 media:** if a single IMAGE asset is attached, register it via the Images API (`POST /rest/images?action=initializeUpload` → upload the bytes to the returned URL → reference the image URN in the post `content`); otherwise post text-only. Multi-image + video deferred. Return `{ platformPostId: postUrn, platformPostUrl: https://www.linkedin.com/feed/update/<urn> }`.
- **refreshToken:** `POST /oauth/v2/accessToken` (form body, `grant_type=refresh_token`) when a refresh token exists; else this connector omits `refreshToken` (LinkedIn tokens last ~60d — user reconnects).
- v1: posts to the **member** profile (no org-page support).

## Wiring (mirrors the YouTube connector)
- `ConnectorRegistry` — inject + register `['FACEBOOK', facebook]` + `['LINKEDIN', linkedin]`.
- `connectors.module.ts` — add both to `providers`.
- `oauth.controller.ts` `PLATFORM_FROM_PARAM` — `facebook: 'FACEBOOK'`, `linkedin: 'LINKEDIN'`.
- Settings `page.tsx` — add `FACEBOOK` + `LINKEDIN` to the slug map (`facebook`/`linkedin`) + the connect list (brand icons per the mockup `docs/social-connectors-ui-design.html`).
- `.env.example` — `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`.

## Error handling
- Connectors throw on a non-OK response with the platform status (no token in the message); the publish processor records FAILED + the message (and the token-refresh layer flips to `PENDING_REAUTH` on a failed refresh).
- FB: no managed Page → BadRequest "No Facebook Page found — the connected account must manage a Page."
- LinkedIn: missing `w_member_social` scope → the API 403 surfaces as a clear failure.

## Testing (mocked `axios`), per connector
- `startOauth` URL (scopes + state), `completeOauth` (token + identity parse), `publish` (correct endpoint + body for text/image; return shape), `refreshToken` (where supported). ~4 tests each.
- Live verification parked (needs a Meta app + a LinkedIn app).

## Out of scope (v1)
FB multi-Page picker; LinkedIn org-page posting, multi-image, video; per-post options (FB audience, LinkedIn visibility selector — defaults to PUBLIC); analytics read-back.
