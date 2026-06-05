# Composer → Save Draft / Schedule Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Save draft" and "Schedule" actions to the Composer that turn the current draft (per-platform caption + hashtags + attached media) into a real `Post` via the existing `POST /posts` and `POST /posts/:id/schedule` endpoints.

**Architecture:** Front-end only — no backend changes. A pure, unit-tested transform (`buildCreatePostInput`) lives in `@inboudly/shared` so the existing API jest can test it; the Composer calls it and posts to the existing pipeline (which already publishes to connected accounts). Unconnected platforms get an advisory note, not a hard block.

**Tech Stack:** Next.js 15 + React 19, TanStack Query v5, sonner, lucide-react, zod (`@inboudly/shared`), the existing posts/scheduler backend.

**Spec:** `docs/superpowers/specs/2026-06-05-composer-publishing-design.md`

---

## File Structure

- **Create** `packages/shared/src/build-post-input.ts` — `parseHashtags()` + `buildCreatePostInput()` (pure; returns `CreatePostInput`).
- **Create** `packages/shared/src/build-post-input.spec.ts` — unit tests (run by the existing `apps/api` jest via its `testMatch` for `packages/shared/src`).
- **Modify** `packages/shared/src/index.ts` — export the new module.
- **Modify** `apps/web/src/app/dashboard/composer/page.tsx` — mutations, action bar, schedule panel, account-awareness note, validation.

The Composer already holds: `workspaceId`, `selectedPlatforms`, `captions[platform]`, `hashtags[platform]` (raw string), `attachedImageIds[platform]` (= media asset ids), `qc = useQueryClient()`, and imports `api`, `toast`, and `SocialPlatform` from `@inboudly/shared/platforms`.

`CreatePostInput` is already exported from `@inboudly/shared` (z.infer of `CreatePostSchema`, used by the API's posts controller). `CreatePostSchema` shape: `{ workspaceId, title?, variants: [{ platform, caption, language, hashtags[], mentions[], mediaAssetIds[], platformOptions? }], approvalRequired }`.

---

## Task 1: `parseHashtags` + `buildCreatePostInput` (TDD, in shared)

**Files:**
- Create: `packages/shared/src/build-post-input.ts`
- Test: `packages/shared/src/build-post-input.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/build-post-input.spec.ts`:

```ts
import { buildCreatePostInput, parseHashtags } from './build-post-input';

const WS = 'clxxxxxxxxxxxxxxxxxxxxxxx0';
const M1 = 'clmediaaaaaaaaaaaaaaaaaaa1';

describe('parseHashtags', () => {
  it('splits on whitespace and strips leading #', () => {
    expect(parseHashtags('#skincare #summer  glow')).toEqual(['skincare', 'summer', 'glow']);
  });
  it('drops empties and handles undefined/blank', () => {
    expect(parseHashtags('   ')).toEqual([]);
    expect(parseHashtags(undefined)).toEqual([]);
    expect(parseHashtags('##x')).toEqual(['x']);
  });
});

describe('buildCreatePostInput', () => {
  it('builds one variant per selected platform with trimmed caption, parsed hashtags, and media', () => {
    const out = buildCreatePostInput({
      workspaceId: WS,
      selectedPlatforms: ['INSTAGRAM', 'TIKTOK'],
      captions: { INSTAGRAM: '  hi there  ', TIKTOK: 'yo' } as any,
      hashtags: { INSTAGRAM: '#a #b', TIKTOK: '' } as any,
      attachedImageIds: { INSTAGRAM: [M1], TIKTOK: [] } as any,
    });
    expect(out.workspaceId).toBe(WS);
    expect(out.approvalRequired).toBe(false);
    expect(out.variants).toHaveLength(2);
    expect(out.variants[0]).toEqual({
      platform: 'INSTAGRAM',
      caption: 'hi there',
      language: 'en',
      hashtags: ['a', 'b'],
      mentions: [],
      mediaAssetIds: [M1],
    });
    expect(out.variants[1]).toEqual({
      platform: 'TIKTOK',
      caption: 'yo',
      language: 'en',
      hashtags: [],
      mentions: [],
      mediaAssetIds: [],
    });
  });

  it('only includes selected platforms and tolerates missing per-platform entries', () => {
    const out = buildCreatePostInput({
      workspaceId: WS,
      selectedPlatforms: ['REDNOTE'],
      captions: {} as any,
      hashtags: {} as any,
      attachedImageIds: {} as any,
    });
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]).toEqual({
      platform: 'REDNOTE',
      caption: '',
      language: 'en',
      hashtags: [],
      mentions: [],
      mediaAssetIds: [],
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `pnpm --filter @inboudly/api test -- build-post-input`
Expected: FAIL — `build-post-input` module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/build-post-input.ts`:

```ts
import { type CreatePostInput } from './schemas';
import { type SocialPlatform } from './platforms';

/** "#a #b  c" -> ["a","b","c"]; strips leading #, splits on whitespace, drops empties. */
export function parseHashtags(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\s+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter((t) => t.length > 0);
}

type Rec<T> = Partial<Record<SocialPlatform, T>>;

/** Turn the Composer draft into a CreatePostInput (one variant per selected platform). */
export function buildCreatePostInput(args: {
  workspaceId: string;
  selectedPlatforms: SocialPlatform[];
  captions: Rec<string>;
  hashtags: Rec<string>;
  attachedImageIds: Rec<string[]>;
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
    })),
    approvalRequired: false,
  };
}
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `pnpm --filter @inboudly/api test -- build-post-input`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Im_tHe_rEaL_LiM/source/repos/Inboudly"
git add packages/shared/src/build-post-input.ts packages/shared/src/build-post-input.spec.ts
git commit -m "feat(shared): buildCreatePostInput + parseHashtags for Composer publishing" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Export from the shared barrel + rebuild

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add the export**

`packages/shared/src/index.ts` currently is:
```ts
export * from './platforms';
export * from './schemas';
export * from './constants';
```
Add a line:
```ts
export * from './build-post-input';
```

- [ ] **Step 2: Rebuild shared so consumers (web) see it via dist**

Run: `pnpm --filter @inboudly/shared build`
Expected: PASS — `tsc` completes, no errors (spec files are excluded from the build).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(shared): export build-post-input from barrel" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Composer — mutations, action bar, schedule panel

**Files:**
- Modify: `apps/web/src/app/dashboard/composer/page.tsx`

> Read the file first. It already has `qc = useQueryClient()`, `workspaceId`, `selectedPlatforms`, `captions`, `hashtags`, `attachedImageIds`, and imports `api`, `toast`. You'll add: imports, two mutations, schedule-panel state, and an action bar at the end of the left column (after the platform/generation cards).

- [ ] **Step 1: Add imports + state**

Ensure these imports exist at the top (add what's missing):
```tsx
import { buildCreatePostInput } from '@inboudly/shared';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
```
(`Loader2` is already imported — don't duplicate; add only `buildCreatePostInput` and `Calendar as CalendarIcon`.)

Add state near the other `useState` calls in the component:
```tsx
const [showSchedule, setShowSchedule] = useState(false);
// default schedule = now + 1h, formatted for <input type="datetime-local">
const [scheduleAt, setScheduleAt] = useState('');
const [postError, setPostError] = useState<string | null>(null);
```

- [ ] **Step 2: Add the two mutations**

Below the existing `generateVideo`/`videoStatus` definitions, add:
```tsx
const createPost = useMutation({
  mutationFn: (scheduledFor?: string) => {
    const input = buildCreatePostInput({
      workspaceId: workspaceId!,
      selectedPlatforms,
      captions,
      hashtags,
      attachedImageIds,
    });
    return api.post<{ id: string }>('/posts', input).then(async (post) => {
      if (scheduledFor) {
        await api.post(`/posts/${post.id}/schedule`, { scheduledFor });
      }
      return { id: post.id, scheduledFor };
    });
  },
  onSuccess: ({ scheduledFor }) => {
    setShowSchedule(false);
    qc.invalidateQueries({ queryKey: ['posts', workspaceId] });
    toast.success(scheduledFor ? 'Post scheduled' : 'Draft saved', {
      description: scheduledFor
        ? `Publishes ${new Date(scheduledFor).toLocaleString()}. View it on the Calendar.`
        : 'Saved to your Calendar as a draft.',
      duration: 7000,
    });
  },
  onError: (err: any) =>
    toast.error("Couldn't save the post", { description: err?.message ?? 'Please try again.', duration: 8000 }),
});
```

- [ ] **Step 3: Add a validation helper + handlers**

Add inside the component (before `return`):
```tsx
const canPost =
  !!workspaceId &&
  selectedPlatforms.length > 0 &&
  selectedPlatforms.some((p) => (captions[p] ?? '').trim().length > 0);

const validateThenRun = (scheduledFor?: string) => {
  if (selectedPlatforms.length === 0) return setPostError('Pick at least one platform.');
  if (!selectedPlatforms.some((p) => (captions[p] ?? '').trim())) {
    return setPostError('Add a caption for at least one selected platform.');
  }
  if (scheduledFor && new Date(scheduledFor).getTime() <= Date.now()) {
    return setPostError('Pick a time in the future.');
  }
  setPostError(null);
  createPost.mutate(scheduledFor);
};
```

- [ ] **Step 4: Add the action bar JSX**

At the END of the left/main column (after the last generation card, before the column's closing `</div>`), add:
```tsx
{/* Save / Schedule action bar */}
<div className="rounded-lg border bg-background p-4">
  <div className="flex flex-wrap items-center gap-3">
    <button
      type="button"
      disabled={!canPost || createPost.isPending}
      onClick={() => validateThenRun()}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
    >
      {createPost.isPending && !showSchedule ? 'Saving…' : 'Save draft'}
    </button>
    <button
      type="button"
      disabled={!canPost || createPost.isPending}
      onClick={() => {
        const d = new Date(Date.now() + 60 * 60 * 1000);
        // to "YYYY-MM-DDTHH:mm" in local time for datetime-local
        const pad = (n: number) => String(n).padStart(2, '0');
        setScheduleAt(
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
        );
        setPostError(null);
        setShowSchedule((s) => !s);
      }}
      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
    >
      <CalendarIcon className="h-4 w-4" aria-hidden="true" /> Schedule…
    </button>
  </div>

  {showSchedule && (
    <div className="mt-3 rounded-md border bg-secondary/30 p-3">
      <label htmlFor="schedule-at" className="text-xs font-medium">Publish at</label>
      <input
        id="schedule-at"
        type="datetime-local"
        value={scheduleAt}
        onChange={(e) => setScheduleAt(e.target.value)}
        className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setShowSchedule(false)}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={createPost.isPending || !scheduleAt}
          onClick={() => validateThenRun(new Date(scheduleAt).toISOString())}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Schedule
        </button>
      </div>
    </div>
  )}

  {postError && <p className="mt-2 text-sm text-destructive">{postError}</p>}
</div>
```

- [ ] **Step 5: Build**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS. (If a first build right after a cache wipe flakes with no real error, run it again.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/composer/page.tsx
git commit -m "feat(web): Composer save-draft + schedule action bar" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Composer — connected-account advisory note

**Files:**
- Modify: `apps/web/src/app/dashboard/composer/page.tsx`

- [ ] **Step 1: Add the social-accounts query**

Near the other queries, add:
```tsx
const accounts = useQuery({
  queryKey: ['social-accounts', workspaceId],
  queryFn: () => api.get<Array<{ id: string; platform: string; status: string }>>(
    `/social-accounts?workspaceId=${workspaceId}`,
  ),
  enabled: !!workspaceId,
});

const connectedPlatforms = new Set(
  (accounts.data ?? []).filter((a) => a.status === 'ACTIVE').map((a) => a.platform),
);
const unconnected = selectedPlatforms.filter((p) => !connectedPlatforms.has(p));
```

- [ ] **Step 2: Render the advisory note inside the action-bar card**

Inside the action-bar `<div>` from Task 3 (after the buttons row, before `{showSchedule && …}`), add:
```tsx
{unconnected.length > 0 && (
  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
    No connected account for {unconnected.join(', ')} — <a href="/dashboard/settings" className="underline">connect in Settings</a> to publish. Your draft still saves.
  </p>
)}
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @inboudly/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/composer/page.tsx
git commit -m "feat(web): advisory note for unconnected platforms in Composer" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full validation + manual test

**Files:** none (verification only)

- [ ] **Step 1: Unit + type-check + build**

Run:
```
pnpm --filter @inboudly/api test -- build-post-input
pnpm --filter @inboudly/web build
```
Expected: build-post-input tests pass; web build clean.

- [ ] **Step 2: Manual (dev servers running, signed in)**

1. Composer: pick a platform, write a caption, attach a generated image/video.
2. **Save draft** → success toast; open **Calendar** → the post appears as a DRAFT with its media.
3. **Schedule…** → pick a near-future time → **Schedule** → toast; the post shows as scheduled on the Calendar.
4. If a selected platform has no connected account, the amber advisory note shows; saving still works.
5. (With a connected account) confirm the scheduled post publishes at the set time (or shortly after).

- [ ] **Step 3: Final commit (if any tweaks)**

```bash
git add -A && git commit -m "test: validate Composer publishing flow" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Save-draft (Task 3) ✓; Schedule with future-only datetime (Task 3) ✓; per-platform variant mapping with media via `buildCreatePostInput` (Task 1) ✓; hashtag parsing (Task 1) ✓; account advisory note, non-blocking (Task 4) ✓; validation — ≥1 platform, ≥1 non-empty caption, future time (Task 3) ✓; reuse existing endpoints, no backend change ✓; unit-tested pure transform ✓.

**Placeholder scan:** None — every step has complete code/commands.

**Type consistency:** `buildCreatePostInput`/`parseHashtags` names consistent across Task 1 (definition), Task 2 (export), Task 3 (use). Returns `CreatePostInput` (existing shared type). Mutation posts to `/posts` then `/posts/:id/schedule` (existing routes). `canPost`/`validateThenRun`/`scheduleAt`/`showSchedule`/`postError` consistent across Task 3. `connectedPlatforms`/`unconnected` consistent across Task 4.
