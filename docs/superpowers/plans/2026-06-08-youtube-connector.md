# YouTube Publishing Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a YouTube publishing connector so a connected workspace can publish a post's video to YouTube (Data API v3) with a per-post privacy choice.

**Architecture:** A new `YouTubeConnector implements IPlatformConnector` (raw `axios`, no injected deps — mirrors the Instagram connector), registered in `ConnectorRegistry` and reachable through the existing generic `/oauth/:platform/*` flow. Publishing fetches the clip bytes from R2 and does a resumable `videos.insert`. Per-post privacy rides in the existing `PostVariant.platformOptions` (no migration), surfaced by a Composer control and threaded through the shared `buildCreatePostInput`.

**Tech Stack:** NestJS 10, `axios`, Google OAuth 2.0 + YouTube Data API v3, jest (mocked HTTP), Next.js 15 + Tailwind + shadcn/ui, `@inboudly/shared` (zod).

**Spec:** `docs/superpowers/specs/2026-06-08-youtube-connector-design.md`

**Branch:** `feat/youtube-connector` (already exists)

---

## File Structure

- **Modify** `packages/shared/src/build-post-input.ts` (+ `.spec.ts`) — thread optional per-platform `platformOptions`.
- **Create** `apps/api/src/modules/connectors/youtube/youtube.connector.ts` (+ `.spec.ts`) — the connector.
- **Modify** `apps/api/src/modules/connectors/connector-registry.service.ts` — register `YOUTUBE`.
- **Modify** `apps/api/src/modules/oauth/oauth.controller.ts` — add `youtube → YOUTUBE` to the param map.
- **Modify** `apps/web/src/app/dashboard/settings/page.tsx` — add `YOUTUBE` to the connect list + slug map.
- **Modify** `apps/web/src/app/dashboard/composer/page.tsx` — per-post YouTube settings block + wire `platformOptions`.
- **Modify** `.env.example` — `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.

> **Title note:** `PublishInput` carries the *variant* (not the parent Post), so the YouTube title is derived from the **caption's first non-empty line** (≤100 chars, fallback `'Untitled'`). Post-title-as-YouTube-title is deferred (would require extending `PublishInput`).

---

## Task 1: Thread `platformOptions` through `buildCreatePostInput`

**Files:**
- Modify: `packages/shared/src/build-post-input.ts`
- Test: `packages/shared/src/build-post-input.spec.ts`

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe('buildCreatePostInput', …)` in `build-post-input.spec.ts`:
```ts
  it('threads per-platform platformOptions onto the matching variant', () => {
    const input = buildCreatePostInput({
      workspaceId: 'ws_1',
      selectedPlatforms: ['INSTAGRAM', 'YOUTUBE'],
      captions: { INSTAGRAM: 'hi', YOUTUBE: 'hello' },
      hashtags: { INSTAGRAM: '', YOUTUBE: '#a' },
      attachedImageIds: { INSTAGRAM: [], YOUTUBE: ['vid_1'] },
      platformOptions: { YOUTUBE: { youtube: { privacyStatus: 'unlisted' } } },
    });
    const yt = input.variants.find((v) => v.platform === 'YOUTUBE');
    const ig = input.variants.find((v) => v.platform === 'INSTAGRAM');
    expect(yt?.platformOptions).toEqual({ youtube: { privacyStatus: 'unlisted' } });
    expect(ig?.platformOptions).toBeUndefined();
  });
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @inboudly/api test -- build-post-input`
Expected: FAIL — `buildCreatePostInput` doesn't accept `platformOptions` yet (TS error / `yt.platformOptions` undefined).

- [ ] **Step 3: Implement**

In `build-post-input.ts`, add `platformOptions` to the args type + pass it per variant (only set it when present, so other platforms stay `undefined`):
```ts
export function buildCreatePostInput(args: {
  workspaceId: string;
  selectedPlatforms: SocialPlatform[];
  captions: Rec<string>;
  hashtags: Rec<string>;
  attachedImageIds: Rec<string[]>;
  platformOptions?: Rec<Record<string, unknown>>;
}): CreatePostInput {
  return {
    workspaceId: args.workspaceId,
    variants: args.selectedPlatforms.map((p) => ({
      platform: p,
      caption: (args.captions[p] ?? '').trim(),
      language: 'en',
      hashtags: parseHashtags(args.hashtags[p]),
      mentions: [],
      mediaAssetIds: args.attachedImageIds[p] ?? [],
      ...(args.platformOptions?.[p] ? { platformOptions: args.platformOptions[p] } : {}),
    })),
    approvalRequired: false,
  };
}
```
(`Rec<T>` is the existing `Partial<Record<SocialPlatform, T>>` alias in this file.)

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @inboudly/api test -- build-post-input`
Expected: PASS (existing tests + the new one). Then `pnpm --filter @inboudly/shared build` → emits updated `dist`.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/build-post-input.ts packages/shared/src/build-post-input.spec.ts
git commit -m "feat(shared): thread per-platform platformOptions through buildCreatePostInput" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `YouTubeConnector` — OAuth (TDD)

**Files:**
- Create: `apps/api/src/modules/connectors/youtube/youtube.connector.ts`
- Test: `apps/api/src/modules/connectors/youtube/youtube.connector.spec.ts`

> Read `apps/api/src/modules/connectors/connector.interface.ts` and `connectors/instagram/instagram.connector.ts` first — match the `IPlatformConnector` shape + the raw-`axios` style (no injected deps).

- [ ] **Step 1: Write the failing test**

Create `youtube.connector.spec.ts`:
```ts
import { YouTubeConnector } from './youtube.connector';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YouTubeConnector — OAuth', () => {
  const c = new YouTubeConnector();
  beforeEach(() => { jest.clearAllMocks(); process.env.YOUTUBE_CLIENT_ID = 'cid'; process.env.YOUTUBE_CLIENT_SECRET = 'csec'; });

  it('startOauth builds a Google consent URL with offline access + upload scope', async () => {
    const { url, state } = await c.startOauth('ws_1', 'https://api/cb');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(decodeURIComponent(url)).toContain('youtube.upload');
    expect(state.startsWith('ws_1.')).toBe(true);
  });

  it('completeOauth exchanges the code and returns tokens + channel identity', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } } as any);
    mockedAxios.get.mockResolvedValueOnce({ data: { items: [{ id: 'UC123', snippet: { title: 'Acme', thumbnails: { default: { url: 'http://a/x.png' } } } }] } } as any);
    const t = await c.completeOauth('code', 'ws_1.x', 'https://api/cb');
    expect(t.accessToken).toBe('at');
    expect(t.refreshToken).toBe('rt');
    expect(t.expiresAt).toBeInstanceOf(Date);
    expect(t.platformUser).toEqual({ id: 'UC123', handle: '@Acme', displayName: 'Acme', avatarUrl: 'http://a/x.png', extra: { channelId: 'UC123' } });
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @inboudly/api test -- youtube.connector`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (OAuth methods + shared constants/helpers)**

Create `youtube.connector.ts`:
```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import type {
  IPlatformConnector,
  OauthAuthorizeUrl,
  OauthTokenSet,
  PublishInput,
  PublishResult,
} from '../connector.interface';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

@Injectable()
export class YouTubeConnector implements IPlatformConnector {
  readonly platform = 'YOUTUBE' as const;
  private readonly logger = new Logger(YouTubeConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return { url: `${GOOGLE_AUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, _state: string, redirectUri: string): Promise<OauthTokenSet> {
    const res = await axios.post(GOOGLE_TOKEN, null, {
      params: {
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
    });
    const { access_token, refresh_token, expires_in } = res.data;
    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
      scopes: SCOPES,
      platformUser: await this.fetchChannel(access_token),
    };
  }

  private async fetchChannel(accessToken: string) {
    const res = await axios.get(`${YT_API}/channels`, {
      params: { part: 'snippet', mine: 'true' },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ch = res.data.items?.[0];
    if (!ch) throw new BadRequestException('No YouTube channel found for this Google account');
    return {
      id: ch.id as string,
      handle: `@${ch.snippet.title}`,
      displayName: ch.snippet.title as string,
      avatarUrl: ch.snippet.thumbnails?.default?.url as string | undefined,
      extra: { channelId: ch.id as string },
    };
  }

  // publish() + refreshToken() added in Task 3.
  async publish(_input: PublishInput): Promise<PublishResult> {
    throw new Error('not implemented'); // replaced in Task 3
  }
}
```

- [ ] **Step 4: Run, verify PASS + type-check**

Run: `pnpm --filter @inboudly/api test -- youtube.connector` → 2 pass.
Run: `pnpm --filter @inboudly/api type-check` → clean.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/connectors/youtube/youtube.connector.ts apps/api/src/modules/connectors/youtube/youtube.connector.spec.ts
git commit -m "feat(api): YouTubeConnector OAuth (Google consent + channel identity)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `YouTubeConnector` — publish + refreshToken (TDD)

**Files:**
- Modify: `apps/api/src/modules/connectors/youtube/youtube.connector.ts`
- Test: `apps/api/src/modules/connectors/youtube/youtube.connector.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append a new `describe` to `youtube.connector.spec.ts`:
```ts
describe('YouTubeConnector — publish', () => {
  const c = new YouTubeConnector();
  beforeEach(() => { jest.clearAllMocks(); });

  const videoVariant = (platformOptions?: any) => ({
    account: { accessToken: 'at', workspaceId: 'ws_1' } as any,
    variant: {
      caption: 'A great clip\nsecond line', hashtags: ['fun', '#wow'], platformOptions,
      media: [{ order: 0, mediaAsset: { type: 'VIDEO', url: 'https://r2/x.mp4' } }],
    } as any,
  });

  it('uploads the clip (resumable) with metadata + privacy and returns the watch url', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: new Uint8Array([1, 2, 3]).buffer } as any); // R2 bytes
    mockedAxios.post.mockResolvedValueOnce({ headers: { location: 'https://upload/session' }, data: {} } as any); // init
    mockedAxios.put.mockResolvedValueOnce({ data: { id: 'vid123' } } as any); // upload
    const r = await c.publish(videoVariant({ youtube: { privacyStatus: 'public' } }));
    const initBody = mockedAxios.post.mock.calls[0][1] as any;
    expect(initBody.snippet.title).toBe('A great clip');
    expect(initBody.snippet.tags).toEqual(['fun', 'wow']);
    expect(initBody.status.privacyStatus).toBe('public');
    expect(mockedAxios.put.mock.calls[0][0]).toBe('https://upload/session');
    expect(r).toEqual({ platformPostId: 'vid123', platformPostUrl: 'https://youtu.be/vid123' });
  });

  it('defaults privacy to unlisted when platformOptions is absent', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: new Uint8Array([1]).buffer } as any);
    mockedAxios.post.mockResolvedValueOnce({ headers: { location: 'https://upload/s' }, data: {} } as any);
    mockedAxios.put.mockResolvedValueOnce({ data: { id: 'v' } } as any);
    await c.publish(videoVariant());
    expect((mockedAxios.post.mock.calls[0][1] as any).status.privacyStatus).toBe('unlisted');
  });

  it('rejects an image-only variant before any HTTP call', async () => {
    await expect(c.publish({
      account: { accessToken: 'at' } as any,
      variant: { caption: 'x', hashtags: [], media: [{ order: 0, mediaAsset: { type: 'IMAGE', url: 'u' } }] } as any,
    })).rejects.toThrow(/video/i);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('refreshToken exchanges the refresh token for a fresh access token', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { access_token: 'at2', expires_in: 3600 } } as any);
    mockedAxios.get.mockResolvedValueOnce({ data: { items: [{ id: 'UC1', snippet: { title: 'Acme' } }] } } as any);
    const t = await c.refreshToken('rt');
    expect(t.accessToken).toBe('at2');
    expect(t.refreshToken).toBe('rt');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @inboudly/api test -- youtube.connector`
Expected: FAIL — `publish` throws "not implemented" / `refreshToken` is not a function.

- [ ] **Step 3: Implement — replace the stub `publish` and add `refreshToken` + helpers**

In `youtube.connector.ts`, replace the stub `publish` with:
```ts
  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const video = variant.media
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => m.mediaAsset)
      .find((m) => m.type === 'VIDEO');
    if (!video) {
      throw new BadRequestException(
        "YouTube requires a video — image-only posts can't be published to YouTube.",
      );
    }

    const snippet = {
      title: this.buildTitle(variant.caption),
      description: this.buildDescription(variant.caption, variant.hashtags),
      tags: this.cleanTags(variant.hashtags),
      categoryId: '22',
    };
    const status = { privacyStatus: this.resolvePrivacy(variant.platformOptions) };

    const bytes = await axios.get(video.url, { responseType: 'arraybuffer' });
    const buf = Buffer.from(bytes.data as ArrayBuffer);

    const init = await axios.post(
      `${YT_UPLOAD}?uploadType=resumable&part=snippet,status`,
      { snippet, status },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(buf.length),
        },
      },
    );
    const sessionUrl = init.headers['location'] as string | undefined;
    if (!sessionUrl) throw new Error('YouTube did not return a resumable upload session URL');

    const uploaded = await axios.put(sessionUrl, buf, {
      headers: { 'Content-Type': 'video/*', 'Content-Length': String(buf.length) },
    });
    const videoId = uploaded.data.id as string;
    this.logger.log(`Published YouTube video ${videoId}`);
    return { platformPostId: videoId, platformPostUrl: `https://youtu.be/${videoId}` };
  }

  async refreshToken(refreshToken: string): Promise<OauthTokenSet> {
    const res = await axios.post(GOOGLE_TOKEN, null, {
      params: {
        refresh_token: refreshToken,
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      },
    });
    const { access_token, expires_in } = res.data;
    return {
      accessToken: access_token,
      refreshToken, // Google does not reissue the refresh token
      expiresAt: new Date(Date.now() + expires_in * 1000),
      scopes: SCOPES,
      platformUser: await this.fetchChannel(access_token),
    };
  }

  private buildTitle(caption: string): string {
    const firstLine = (caption ?? '').split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    return (firstLine || 'Untitled').slice(0, 100);
  }

  private buildDescription(caption: string, hashtags: string[]): string {
    const tags = (hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  }

  private cleanTags(hashtags: string[]): string[] {
    return (hashtags ?? []).map((h) => h.replace(/^#+/, '').trim()).filter((t) => t.length > 0);
  }

  private resolvePrivacy(opts: unknown): 'public' | 'unlisted' | 'private' {
    const p = (opts as { youtube?: { privacyStatus?: string } } | null | undefined)?.youtube?.privacyStatus;
    return p === 'public' || p === 'private' ? p : 'unlisted';
  }
```
(Remove the Task-2 stub `publish` that threw "not implemented".)

- [ ] **Step 4: Run, verify PASS + type-check**

Run: `pnpm --filter @inboudly/api test -- youtube.connector` → all (2 OAuth + 4 publish) pass.
Run: `pnpm --filter @inboudly/api type-check` → clean.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/connectors/youtube/youtube.connector.ts apps/api/src/modules/connectors/youtube/youtube.connector.spec.ts
git commit -m "feat(api): YouTubeConnector publish (resumable upload + per-post privacy) + refreshToken" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Register the connector + OAuth param map

**Files:**
- Modify: `apps/api/src/modules/connectors/connector-registry.service.ts`
- Modify: `apps/api/src/modules/oauth/oauth.controller.ts`
- Modify: `apps/api/src/modules/connectors/connectors.module.ts` (only if connectors are listed as providers there — check first)

- [ ] **Step 1: Register in the registry**

In `connector-registry.service.ts`: import `YouTubeConnector`, add a constructor param `youtube: YouTubeConnector`, and add `['YOUTUBE', youtube]` to the `connectors` Map.

- [ ] **Step 2: Add to the OAuth param map**

In `oauth.controller.ts`, add to `PLATFORM_FROM_PARAM`:
```ts
  youtube: 'YOUTUBE',
```

- [ ] **Step 3: Provider wiring**

Open `connectors.module.ts`. If the existing connectors (Instagram/TikTok/RedNote) are listed in `providers`, add `YouTubeConnector` there too (import it). If the registry constructs them itself, no change needed — match the existing pattern.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @inboudly/api type-check` → clean.
Run: `pnpm --filter @inboudly/api build` → clean (confirms DI wiring compiles).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/connectors/connector-registry.service.ts apps/api/src/modules/oauth/oauth.controller.ts apps/api/src/modules/connectors/connectors.module.ts
git commit -m "feat(api): register YouTube connector + OAuth route" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Settings — add YouTube to the connect-accounts UI

**Files:**
- Modify: `apps/web/src/app/dashboard/settings/page.tsx`

> Read the file first: it has a slug map (`{ INSTAGRAM: 'instagram', TIKTOK: 'tiktok', REDNOTE: 'rednote' }`) and a hardcoded list `(['INSTAGRAM','TIKTOK','REDNOTE'] as const).map(...)` rendering connect rows.

- [ ] **Step 1: Add YOUTUBE to the slug map + the rendered list**

Add `YOUTUBE: 'youtube'` to the slug map, and `'YOUTUBE'` to the platform list array. Mirror the existing row markup exactly (lucide `Youtube` icon if the rows use platform icons; otherwise match the existing row component). The connect button already builds `${API_URL}/api/v1/oauth/${slug}/start?workspaceId=...` — `slug='youtube'` now resolves.

- [ ] **Step 2: Verify**

Run: `pnpm --filter @inboudly/web type-check` → clean.
Run: `pnpm --filter @inboudly/web build` → succeeds (retry once if a first build flakes).

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/app/dashboard/settings/page.tsx
git commit -m "feat(web): add YouTube to the connect-accounts list" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Composer — per-post YouTube settings block

**Files:**
- Modify: `apps/web/src/app/dashboard/composer/page.tsx`

> Read the Composer first: it already builds the post via `buildCreatePostInput({...})` in the `createPost` mutation, tracks `selectedPlatforms`, per-platform `captions`/`hashtags`/`attachedImageIds`, and (from the video work) `attachedAssets` with `{type}`. Match the existing control styling.

- [ ] **Step 1: State for per-post YouTube privacy**

Add:
```ts
const [youtubePrivacy, setYoutubePrivacy] = useState<'public' | 'unlisted' | 'private'>('unlisted');
```

- [ ] **Step 2: Pass `platformOptions` into `buildCreatePostInput`**

In the `createPost` mutation, build a `platformOptions` map and pass it:
```ts
const platformOptions = selectedPlatforms.includes('YOUTUBE')
  ? { YOUTUBE: { youtube: { privacyStatus: youtubePrivacy } } }
  : undefined;
const input = buildCreatePostInput({
  workspaceId: workspaceId!,
  selectedPlatforms, captions, hashtags, attachedImageIds,
  platformOptions,
});
```

- [ ] **Step 3: Render the YouTube block (only when YouTube is selected)**

Where platform-specific controls render, add (matching existing classes):
```tsx
{selectedPlatforms.includes('YOUTUBE') && (
  <div className="rounded-lg border bg-background p-4">
    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
      <Youtube className="h-4 w-4 text-[#ff0033]" aria-hidden="true" /> YouTube
    </h3>
    <label className="text-xs font-medium" id="yt-privacy-label">Privacy for this upload</label>
    <div role="radiogroup" aria-labelledby="yt-privacy-label" className="mt-1 inline-flex rounded-md border">
      {(['public', 'unlisted', 'private'] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={youtubePrivacy === p}
          onClick={() => setYoutubePrivacy(p)}
          className={`min-h-[40px] px-3 py-2 text-sm capitalize first:rounded-l-md last:rounded-r-md focus:outline-none focus:ring-2 focus:ring-ring ${youtubePrivacy === p ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
        >
          {p}
        </button>
      ))}
    </div>
    {!selectedPlatforms.some((p) => (attachedImageIds['YOUTUBE'] ?? []).some((id) => attachedAssets[id]?.type === 'video')) && (
      <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
        No video attached. YouTube is video-only — attach or generate a clip, or remove YouTube from this post. Your draft still saves.
      </p>
    )}
    <p className="mt-2 text-xs text-muted-foreground">
      Vertical &amp; ≤60s posts as a Short automatically. Uses the channel you connected in Settings.
    </p>
  </div>
)}
```
Add `Youtube` to the `lucide-react` import. (If `attachedAssets`/`attachedImageIds` keys differ, adapt the video-presence check to the real state — the goal: show the alert when no VIDEO asset is attached for YouTube.)

- [ ] **Step 4: Verify**

Run: `pnpm --filter @inboudly/web type-check` → clean.
Run: `pnpm --filter @inboudly/web build` → succeeds.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/app/dashboard/composer/page.tsx
git commit -m "feat(web): per-post YouTube privacy + video-only guard in Composer" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Env template + full validation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the env vars**

Append to `.env.example` (under the other OAuth/provider keys):
```
# YouTube (Google OAuth) — for the YouTube publishing connector
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
```

- [ ] **Step 2: Full automated validation**

Run:
```
pnpm --filter @inboudly/api test
pnpm --filter @inboudly/api type-check
pnpm --filter @inboudly/api build
pnpm --filter @inboudly/web type-check
pnpm --filter @inboudly/web build
```
Expected: all green (the new `build-post-input` + `youtube.connector` specs pass; both apps build).

- [ ] **Step 3: Commit**
```bash
git add .env.example
git commit -m "chore: document YouTube OAuth env vars" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Live verification (parked — needs a Google Cloud OAuth app + a channel)**

Documented in the spec's "External setup". When credentials exist: connect YouTube in Settings → in the Composer pick YouTube + a video + privacy → Save/Schedule → confirm the video appears on the channel at the returned `youtu.be/<id>`. Not required to complete this plan.

---

## Self-Review

**Spec coverage:** `platformOptions` threading (Task 1) ✓; connector OAuth (Task 2) ✓; publish + refresh, video-only, privacy default, resumable upload (Task 3) ✓; registry + OAuth route (Task 4) ✓; Settings connect UI (Task 5) ✓; Composer per-post privacy + video-only guard (Task 6) ✓; env vars + validation (Task 7) ✓; live verification parked (Task 7 Step 4) ✓. Title = caption-first-line (documented deviation from spec's "post.title ??", noted in File Structure).

**Placeholder scan:** Complete code in every code step. Tasks 4/5/6 say "read the file + match existing pattern" because those files' exact surrounding markup isn't quoted here, but the precise edit (what to add + where) and the verification commands are specified.

**Type consistency:** `privacyStatus` ∈ `public|unlisted|private` consistent across connector (`resolvePrivacy`), Composer state, and `platformOptions.youtube.privacyStatus`. `YOUTUBE` SocialPlatform consistent across registry, OAuth map, settings slug, Composer. `OauthTokenSet`/`PublishInput`/`PublishResult` match `connector.interface.ts`. `buildCreatePostInput` arg `platformOptions?: Rec<Record<string, unknown>>` matches its use in Task 6.
