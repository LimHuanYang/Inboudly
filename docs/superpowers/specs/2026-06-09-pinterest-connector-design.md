# Pinterest Connector — Design Spec

**Date:** 2026-06-09 · **Branch:** `feat/phase2b-analytics-pinterest` · **Status:** approved design

## Goal
Add a Pinterest publishing connector (create a Pin on a board) behind the existing `IPlatformConnector` seam — same pattern as YouTube/Facebook/LinkedIn. `PINTEREST` is already in the `SocialPlatform` enum + `PLATFORM_SPECS`. **No DB migration.**

## Reused (no rebuild)
- `IPlatformConnector`, `ConnectorRegistry`, generic `/oauth/:platform/*` controller (+ `PLATFORM_FROM_PARAM`), `SocialAccount` storage, the publish processor (+ token-refresh), the Settings connect rows + 3 states. Inherits token-refresh + `PENDING_REAUTH`.

## Approach
One raw-`axios`, dependency-free `PinterestConnector` (model on `facebook.connector.ts`), registered + routed + a Settings row + env vars. Implementers verify exact endpoints/scopes against current Pinterest API docs (live test parked until an app exists).

## PinterestConnector (`connectors/pinterest/pinterest.connector.ts`, `platform = 'PINTEREST'`)
- **startOauth:** `https://www.pinterest.com/oauth/`, `client_id = PINTEREST_CLIENT_ID`, `response_type=code`, `scope='boards:read,pins:read,pins:write'`, `state = "${workspaceId}.<hex>"`.
- **completeOauth:** `POST https://api.pinterest.com/v5/oauth/token` (form body: grant_type=authorization_code, code, redirect_uri; HTTP Basic `client_id:client_secret` in the `Authorization` header — Pinterest's documented scheme; secret NOT in query) → `access_token` (+ `refresh_token`, `expires_in`). `GET https://api.pinterest.com/v5/user_account` → `username`, `id`. `platformUser = { id: username, handle: username, displayName: username, extra: {} }`. Pick the first board lazily at publish time (or store none).
- **publish:** resolve a target board — `GET /v5/boards` → first board id (or `account.meta.boardId` if present). `POST https://api.pinterest.com/v5/pins` with `{ board_id, title?: caption first line, description: caption+hashtags, media_source: { source_type: 'image_url', url: <first image asset url> } }` (image v1; video Pins are a multi-step upload — deferred). Return `{ platformPostId: pin.id, platformPostUrl: \`https://www.pinterest.com/pin/${pin.id}\` }`. If no image asset → BadRequest "Pinterest requires an image."
- **refreshToken:** `POST /v5/oauth/token` (grant_type=refresh_token, Basic auth) → fresh token set (+ re-fetch user_account).

## Wiring (mirror the FB/LinkedIn precedent — exact sites from scout)
- `connector-registry.service.ts` — inject + `['PINTEREST', pinterest]`.
- `connectors.module.ts` — add `PinterestConnector` to `providers`.
- `oauth.controller.ts` `PLATFORM_FROM_PARAM` — `pinterest: 'PINTEREST'`.
- Settings `page.tsx` — `PINTEREST: 'pinterest'` slug + `'PINTEREST'` in the connect list.
- `.env.example` — `PINTEREST_CLIENT_ID`/`PINTEREST_CLIENT_SECRET` + redirect-URI comment (`{NEXT_PUBLIC_API_URL}/api/v1/oauth/pinterest/callback`).

## Testing (mocked axios, ~4)
`startOauth` URL (scopes + state); `completeOauth` (token + user_account → platformUser; secret not in query); `publish` (board lookup + `POST /v5/pins` body with image media_source; no-image → BadRequest); `refreshToken`.

## Out of scope (v1)
Video Pins (multi-step upload); board picker UI (uses first board); per-post board selection; analytics.
