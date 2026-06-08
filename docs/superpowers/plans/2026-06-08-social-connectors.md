# Facebook + LinkedIn Connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkboxes track steps.

**Goal:** Add Facebook (Page) + LinkedIn (member) publishing connectors behind the existing `IPlatformConnector` seam, mirroring the YouTube connector.

**Architecture:** Two raw-`axios`, dependency-free connectors (FB models on the in-repo `InstagramConnector`; LinkedIn uses LinkedIn OAuth + Posts API), registered in `ConnectorRegistry`, reachable via the generic `/oauth/:platform/*` route, surfaced as two Settings connect rows. They inherit the token-refresh + `PENDING_REAUTH` flow.

**Spec:** `docs/superpowers/specs/2026-06-08-social-connectors-design.md` (authoritative for each connector's endpoints/scopes/contract). **Mockup:** `docs/social-connectors-ui-design.html`. **Branch:** `feat/social-connectors`. **References to read:** `connectors/instagram/instagram.connector.ts` (FB model), `connectors/youtube/youtube.connector.ts` (pattern + tests), `connectors/connector.interface.ts`.

---

## Task S1: FacebookConnector (TDD)
**Files:** Create `apps/api/src/modules/connectors/facebook/facebook.connector.ts` (+ `.spec.ts`)
- [ ] Implement `IPlatformConnector` for `FACEBOOK` per the spec's FacebookConnector section, **modeling closely on `instagram.connector.ts`** (same Graph API + FB OAuth dialog + `fb_exchange_token` long-lived token + `/me/accounts` page lookup). `publish` dispatches text→`/{page}/feed`, image→`/{page}/photos`, video→`/{page}/videos`. Env `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`.
- [ ] Tests (mock `axios`, mirror `youtube.connector.spec.ts` style): `startOauth` URL has the page scopes + `state`; `completeOauth` parses long-lived token + page id/token; `publish` (text → `/feed` with `message`; single image → `/photos`); `refreshToken` extends via `fb_exchange_token`. ~4 tests.
- [ ] `pnpm --filter @inboudly/api test -- facebook.connector` → green; `type-check` clean. **Do NOT commit** (controller commits). **Do NOT register yet** (Task S3).

## Task S2: LinkedInConnector (TDD)
**Files:** Create `apps/api/src/modules/connectors/linkedin/linkedin.connector.ts` (+ `.spec.ts`)
- [ ] Implement `IPlatformConnector` for `LINKEDIN` per the spec's LinkedInConnector section: OAuth (`openid profile w_member_social`), `completeOauth` (token endpoint form-body + `/v2/userinfo` → `sub`/`personUrn`), `publish` (`POST /rest/posts` with `author`/`commentary`/`visibility: PUBLIC`; v1 media = optional single image via the Images API, else text-only), `refreshToken` (form-body refresh_token grant when a refresh token exists). Env `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`. Send `client_secret` in the **form body**, not the query (security).
- [ ] Tests (mock `axios`): `startOauth` URL (scopes + state); `completeOauth` (token + `userinfo` → personUrn); `publish` text post (`/rest/posts` body shape, return urn); `refreshToken`. ~4 tests.
- [ ] `pnpm --filter @inboudly/api test -- linkedin.connector` → green; `type-check` clean. **Do NOT commit / register.**

## Task S3: Register both + OAuth route
**Files:** Modify `connector-registry.service.ts`, `connectors.module.ts`, `oauth/oauth.controller.ts`
- [ ] Registry: import + constructor params `facebook`/`linkedin`; add `['FACEBOOK', facebook]` + `['LINKEDIN', linkedin]` to the Map.
- [ ] `connectors.module.ts`: add `FacebookConnector` + `LinkedInConnector` to `providers`.
- [ ] `oauth.controller.ts` `PLATFORM_FROM_PARAM`: add `facebook: 'FACEBOOK'`, `linkedin: 'LINKEDIN'`.
- [ ] `pnpm --filter @inboudly/api type-check` → clean. **Do NOT commit.**

## Task S4: Settings connect rows
**Files:** Modify `apps/web/src/app/dashboard/settings/page.tsx`
- [ ] Add `FACEBOOK: 'facebook'` + `LINKEDIN: 'linkedin'` to the `PLATFORM_OAUTH_PATH` slug map, and `'FACEBOOK'` + `'LINKEDIN'` to the connect-list array. Use lucide `Facebook` + `Linkedin` icons per the mockup (brand colour on the icon chip only). The connect/connected/reconnect-needed states already handle them.
- [ ] `pnpm --filter @inboudly/web type-check` → clean (type-check ONLY — dev server may be running). **Do NOT commit.**

## Task S5: Env + full validation
**Files:** Modify `.env.example`
- [ ] Add `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` + `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` (under the Social OAuth section, with a comment on the redirect URI `{NEXT_PUBLIC_API_URL}/api/v1/oauth/{facebook|linkedin}/callback`).
- [ ] Stop dev servers; run full API suite + API type-check + API build + web type-check + web build → all green.

---

## Self-Review
**Spec coverage:** FacebookConnector (S1) ✓; LinkedInConnector (S2) ✓; registry + OAuth route (S3) ✓; connect rows (S4) ✓; env + validation (S5) ✓. Live verification parked (needs Meta + LinkedIn apps), per spec.
**Type consistency:** `FACEBOOK`/`LINKEDIN` (enum) ↔ `facebook`/`linkedin` (slug/param) consistent across registry, OAuth map, slug map. Connectors implement the same `IPlatformConnector` shape verified against `connector.interface.ts`. Each posts to `account.platformUserId` with `account.accessToken` (the page token for FB), consistent with how the processor + token-refresh pass the account.
**Notes:** Implementers verify exact platform endpoints/scopes against current docs (APIs drift; live test parked). `client_secret` goes in the form body for both token exchanges (matches the YouTube hardening).
