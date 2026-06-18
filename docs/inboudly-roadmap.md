# Inboudly — Product Build Roadmap

> Captured from the 2026-06-18 design grills. **These are designs, not yet built.** The Gemini + Higgsfield creative-engine re-architecture **is** built and merged to `main`.
> Companion visuals: `docs/inboudly-post-workflow.html` (publish flow, current vs target), `docs/inboudly-composer-options.html` (composer entry mockups), `docs/inboudly-restructure.html`, `docs/inboudly-plan-creative-engine.html`.

## North star
Bilingual (EN + 中文) generation-first content studio for SE-Asia SMBs & creators. Moat = **compounding brand memory** (learns your voice + what performs) + bilingual per-platform output, with **Higgsfield** (video) and **Gemini** (text + image) as swappable BYOK renderers. RedNote = content-prep only (no compliant publish API).

---

## ⚠️ The critical gap (why publishing is step 1)
The publish **trigger** layer is broken today:
- `POST /posts/:id/schedule` only flips DB status to `SCHEDULED`. Nothing enqueues a publish job.
- `SchedulerService.schedulePost` (the only producer) is **dead code** — nothing calls it.
- There is **no "Post now"** anywhere.
- → No working path publishes a post to any platform. The execution layer (connectors, token refresh, per-platform `PostPublication`) is well-built but unreachable.

---

## Dependency-ordered build sequence

### 1. Publishing workflow ← do first; unblocks everything
- **Scheduling-first.** In-process `@Cron` (~every minute) scans `status=SCHEDULED AND scheduledFor<=now`, **atomically claims** each (→`PUBLISHING`) so overlapping scans can't double-fire, then reuses the existing `PublishProcessor` logic (token refresh → `connector.publish()` per variant).
- **No Redis / BullMQ** — retire the dead BullMQ scheduler. DB is the source of truth (survives restarts); same pattern as the existing video stale-job reaper. A bonus: **cancel just works** (set `CANCELLED`; the cron ignores it — no job to dequeue).
- **Per-platform + idempotent + auto-retry:** each `PostPublication` tracked independently; a SUCCESS is **never re-fired**; failed platforms auto-retry on later cron passes (capped) via the existing `retryCount` / `nextRetryAt` fields.
- **New status `PARTIALLY_PUBLISHED`** (some platforms ok, some not) — don't collapse a 2-of-3 success into FAILED.
- **Fixes folded in:** `buildCreatePostInput` hardcodes `language:'en'` → must carry real per-platform language (EN / 中文); add `assertMember` to `schedule`/`cancel`/`PATCH`/`GET :id` (IDOR); cheap fire-time media-exists check.
- **"Post now"** = thin later add — same publish path, fired immediately instead of by the cron.

### 2. Analytics loop ← needs #1's published posts; feeds the moat
- Per-post engagement pulled on a regular cadence (cron), not just on-demand. Lands in `PublicationMetrics`. This is the signal the moat's engagement layer consumes.

### 3. Composer entry (can run in parallel)
- **Prompt-first** ("what do you want to post about?") **+ a "Suggest ideas" button** → evolves into a generation-first "drafts waiting" home as the moat matures; the blank composer becomes the *edit* view.
- **Per-platform presets** (language + tone; smart defaults out-of-box, tweakable): RedNote→中文 lifestyle 笔记, LinkedIn→EN professional, IG→EN punchy, FB→warm local. One idea → N native per-platform drafts.
- Edit = per-variant cards (inline edit + regenerate). Media = Gemini caption+image; Higgsfield video optional (needs a reference image).

### 4. Moat rung 1 — history layer
- Turn Pinecone on (real key). Cold-start seed = brand Q&A + paste 1-3 example posts + auto-import recent posts where the platform API allows (IG/FB; not RedNote/LinkedIn), seeded **EN + 中文**. Embed → retrieve top-K similar as few-shot so drafts echo the user's style. One brand voice per workspace, expressed through the per-platform presets; retrieval platform-filtered.

### 5. Moat rung 2 — engagement feedback ← needs #2 + #4
- Analytics weights what performed (reuse `viralityScore`) so retrieval leans toward the user's winners; periodic "what works for you" distillation. Make the compounding **visible** in-app (retention + differentiation).

### 6. (later) Generation-first "drafts waiting" home
- The full moat posture: open the app to 3-5 ready-to-approve drafts already in your voice. Needs the moat to be real first.

---

## Known follow-ups (from the creative-engine re-arch, separate)
- Excise dormant OpenAI/Anthropic SDK imports in ancillary services (transcription, repurpose, trend/niche/comment/KOL intelligence) — compile-clean but dead.
- Verify Higgsfield live API (model id + request/response field names) against a real call.
- Avatar + voice (v1.1) — Higgsfield Speak needs a Mandarin TTS (e.g. MiniMax) for the audio.
- Connector restructure (cut Pinterest; RedNote → content-prep), per [[inboudly-positioning]].
