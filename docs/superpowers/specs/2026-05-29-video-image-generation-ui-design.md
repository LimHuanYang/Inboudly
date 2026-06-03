# Video + Image Generation — UI Design Spec

- **Date:** 2026-05-29
- **Status:** Approved design, pending implementation plan
- **Scope:** UI/UX only. Backend architecture (async job model, providers) is covered separately; this spec defines what the user sees and touches.
- **Stack:** Next.js 15 App Router + Tailwind + shadcn/ui, Lucide icons, sonner toasts, TanStack Query.

## 1. Goal

Let users generate **images and videos** from the Composer, choose **provider + model per task** (caption / image / video), and generate **per-scene AI video clips** inside the Faceless Video studio. Video generation is async (30s–several minutes), so the UI must support background jobs without trapping the user on one screen.

## 2. Locked decisions

| Topic | Decision |
|-------|----------|
| Scope | All three surfaces as one cohesive system: Composer, Settings → AI defaults, Faceless studio. |
| Composer media switch | **Segmented control** `[ Image | Video ]` in the existing "Generate with AI" card; controls swap per mode; the prompt textarea is shared. |
| Video controls | Prompt, **duration**, **provider + model picker** (in-Composer), **aspect ratio**, **reference image → video** (optional). |
| Cost visibility | Inline summary line near the CTA **and** an in-Composer provider/model picker. |
| Progress UX | Inline progress in the card while present **+** job continues in the background with a toast + tray badge on completion. |
| Result of a finished clip | **Attach to post draft** (click-to-attach, like images today) **and** auto-**save to media library**. |
| Faceless per-scene | **Per-scene media picker** `Still | AI clip | Upload`, with a project-level **"Generate all clips"** layered on top. |
| Job tracking surface | **Generations tray** (header button + count badge) **and** the **media library** (finished clips + rendering placeholders). |
| Providers | Pollinations (free, keyless, default) + Runway, Kling, Veo (paid BYOK). Veo reuses `geminiKey`; Runway/Kling use existing `runwayKey`/`klingKey`. |
| Cost estimate (v1) | **Time-only ETAs** (e.g. "~90s"). No dollar figures in v1 — there is no provider cost table yet, and wrong prices are worse than none. Overridable later. |

## 3. Design-system alignment

No new design system — reuse existing tokens and components.

- **Tokens:** `--primary: 339 100% 62%` (Inboudly pink), `--accent: 47 91% 53%` (gold), `--muted-foreground`, `--border`, `--destructive`, `--radius: 0.625rem`. Light + dark via existing `.dark` variant.
- **Icons (Lucide, no emoji in product):** `ImageIcon`, `Clapperboard` (video), `Wand2` (generate), `Loader2` (spinner), `Sparkles`, `Activity` (tray), `Upload`. Single family, consistent stroke.
- **Components:** `Card`, `Button`, `Badge`, native `select` styled as today, sonner toasts.
- **Motion:** 150–300ms transitions; progress shimmer/spinner gated behind `prefers-reduced-motion`.
- **Color semantics:** free vs paid and status (queued/rendering/done/failed) always carry an icon + text label, never color alone.

## 4. Surface 1 — Composer media card

The existing "Generate with AI" card gains a segmented toggle. Switching modes swaps the controls but keeps the shared prompt text.

```
┌─ Generate with AI ───────────────────────────────┐
│  [ ● Image | Video ]            segmented         │
│  Describe your video (required)                   │
│  [ textarea …                                  ]  │
│  ↪ Animate an image (optional)  [ pick / upload ] │
│  [ Aspect 9:16 ▾ ] [ Length 8s ▾ ] [ Provider ▾ ] │
│  Free · Pollinations · ~90s         (cost/ETA)    │
│  [            🎬  Generate video             ]     │
└───────────────────────────────────────────────────┘
```

### Controls (Video mode)
- **Prompt** — shared textarea; label changes to "Describe your video".
- **Reference image → video** — optional "Animate an image" row: pick a previously generated image or upload one. When set, the prompt becomes optional (motion/style guidance). Only enabled for providers that support image→video; hidden/disabled otherwise.
- **Aspect ratio** — reuse the existing `1:1 / 4:5 / 9:16 / 16:9` select.
- **Length** — duration select (provider-dependent options, e.g. 4s / 8s).
- **Provider** — compact select: `Free · Pollinations` (default) / `Runway` / `Kling` / `Veo`. Paid providers without a saved key show ` — no key` and are `disabled` (matches `AiDefaultsCard`). Selecting a provider may swap the model + duration options.
- **Cost/ETA line** — directly above the CTA, tabular figures: `Free · Pollinations · ~90s` or `Runway Gen-3 · ~60s`.
- **CTA** — single primary button "Generate video"; "Generate image" in image mode.

### Image mode
Unchanged from today (aspect + count + cost line + Generate). Only the toggle, label, icon, and controls differ.

### States
- **Idle / empty result:** hint under the controls — "Describe a clip and hit Generate."
- **Pending (inline progress):** the CTA region becomes a progress block — `Loader2` + "Rendering… ~2 min" + a subtle determinate bar + **Cancel**. CTA disabled while pending.
- **Background:** if the user navigates away, the job continues server-side; the tray reflects it; a toast + tray badge announce completion.
- **Result:** finished clips render in a results grid (muted, looping `<video>` for clips); click to attach to the active platform variant; also auto-saved to the media library.
- **Disabled CTA:** no prompt and no reference image, or pending, or no workspace.

## 5. Surface 2 — Generations tray (async backbone)

A header button (`Activity` icon + count badge = active jobs) opens a popover.

```
[ Activity ② ]
┌─ Generations ─────────────────────────────┐
│ ▱ Rendering   "sunset skyline timelapse"   │
│   Runway · 9:16 · ~40s left      [Cancel]  │
│ ✓ Ready       "product hero spin"          │
│   Pollinations · 1:1        [View][Attach] │
│ ✕ Failed      "neon city"                  │
│   Kling · quota         [Retry][Details]   │
└────────────────────────────────────────────┘
```

- **Row:** status glyph + prompt snippet + provider/format + contextual actions.
- **Completion:** sonner toast "Your video is ready" with a **View** action; badge decrements; clip appears in the media library. Toast uses `aria-live="polite"`, does not steal focus, auto-dismisses ~5s.
- **Failure:** **Retry** + **Details**; Details shows the friendly provider message (same copy approach as the image-gen error toast).
- **Persistence:** the tray reflects server-side job status, so it survives reloads and is consistent across Composer + Faceless.

## 6. Surface 3 — Settings → AI defaults (Video block)

Add a third section to `AiDefaultsCard`, identical pattern to Caption/Image: Provider `select` + Model `select`, disabled options when no key.

```
┌─ AI defaults ─────────────────────────────────────┐
│  ✨ Caption generation     [Provider ▾][Model ▾]   │
│  🖼  Image generation       [Provider ▾][Model ▾]   │
│  🎬 Video generation       [Provider ▾][Model ▾]   │
│     Free — Pollinations (no key) / Runway — no key │
│     / Kling / Veo (uses Gemini key)               │
└────────────────────────────────────────────────────┘
```

- **Provider options:** `Free — Pollinations`, `Runway`, `Kling`, `Veo`. Each shows ` — no key` + disabled when the underlying key is missing (Runway→`runwayKey`, Kling→`klingKey`, Veo→`geminiKey`; Pollinations keyless).
- **Persisted fields (frontend contract):** `preferredVideoProvider` plus per-provider video model fields, mirroring the existing image-model fields. Exact field names finalized in the implementation plan.

## 7. Surface 4 — Faceless studio (per-scene media picker)

Each scene row gets a **Source** segmented control; the project header gets **Generate all clips**.

```
Faceless project: "5 morning habits"   [ 🎬 Generate all clips ]
────────────────────────────────────────────────────────────────
Scene 1   Source: ( Still | ● AI clip | Upload )
┌────────┐  "Start your day with sunlight…"
│ ▱ render│  clip prompt: [auto from scene ✎]  [Length 8s ▾]
│  ~30s  │  🔊 Generate voice
└────────┘
Scene 2   Source: ( ● Still | AI clip | Upload )
┌────────┐  "Then drink water…"          ✓ still ready
│ [still]│  🔊 Voice ✓
└────────┘
```

- **AI clip** reveals a clip prompt auto-seeded from the scene's narration (editable) + length. While rendering: shimmer + status in the thumbnail; on done it plays inline (muted, loop).
- **Generate all clips** fires generation for every scene set to "AI clip" (scenes on "Still" are skipped), with per-scene status. Reuses the Generations tray and the project's existing status-poll convention.
- **Upload** keeps the current upload path.

## 8. Surface 5 — Media library (reuse + placeholders)

`dashboard/media` already renders `VIDEO` assets (plays `<video>`, shows `durationSec`, has `AI_GENERATED` source). Additions only:

- **In-flight placeholders:** rendering jobs show as shimmer tiles (prompt + provider) that resolve into the real clip on completion — keeps tray and library in sync.
- **No layout shift:** the placeholder tile reserves the final aspect box.

## 9. Cross-cutting UX (designed, not asked)

- **Accessibility:** segmented toggles are `role="radiogroup"` with arrow-key support; all selects keep visible labels; spinners/shimmer respect `prefers-reduced-motion`; status never relies on color alone; contrast ≥ 4.5:1 for text.
- **Errors:** friendly title + description toast (reuse the pattern just shipped for image gen) + tray Retry.
- **Loading:** skeleton/shimmer for any wait > ~300ms; disable the CTA during pending.
- **Empty states:** Composer result hint; media library already has an empty state.

## 10. Out of scope / open for the implementation plan

- Backend async job model, provider SDK adapters, and persistence (separate spec/plan).
- Dollar cost estimates (deferred; time-only in v1).
- Which providers support image→video (capability map drives the "Animate an image" affordance).
- Exact persisted field names for video provider/model preferences.

## 11. Companion mockup

A clickable HTML mockup of these surfaces (matching the app's tokens) lives at `docs/video-image-ui-mockup.html`.
