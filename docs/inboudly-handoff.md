# Inboudly — Project Handoff & State of the World

> **Why this file exists:** a full, portable snapshot of everything decided and built on Inboudly, written so a **fresh Claude Code account** (with no access to the previous account's memory) can pick up cold. The per-account memory lives in `~/.claude/projects/<slug>/memory/` and does **not** transfer between accounts — this file consolidates it. Compiled 2026-06-24.
>
> **New account, start here:** read §1–§3 for what/why, §4 for what's already built, §6 for what's pending. Memory is dumped verbatim in §10 — you can re-seed the new account's memory from it (or use the `import-memory` skill). Memory citations may be stale — **verify against current code before asserting facts.**

---

## 1. What Inboudly is

An **AI-native social-media management platform** for **bilingual (English + 中文) SME owners & solo creators in SE Asia** (Malaysia / Singapore). It generates on-brand posts (caption + image + video) and publishes/schedules them across platforms.

- **Core job:** *beat the blank page* — nothing → ready-to-post in minutes. **Generation-first**, not calendar-first.
- **The moat (the one defensible edge):** **compounding brand memory** — content that learns the user's voice from their *own* published posts + engagement over time. Deep research (2026-06-16) confirmed **no incumbent** (Jasper, Predis.ai, Hootsuite, SocialBee) does this — they use static brand-voice that only changes via manual edits.
- **Business model:** **BYOK / "never the biller"** — Inboudly never charges for AI; users supply their own keys, encrypted at rest (`ENCRYPTION_KEY`). Collapsed to **one free Google Gemini key** (does caption text + image).
- **The flywheel (why it compounds):** publish → analytics pulls engagement → "this won" insight → one-tap "generate more like it" seeds the composer from the winner → brand memory weights it up → better next draft → publish → … Publishing + Analytics + Moat + Composer are **one loop**, not four features.

**Caveats (unvalidated):** the SEA-bilingual gap is *inferred* from incumbent English-centricity, not measured — validate with real users. Pricing is still open. Higgsfield ToS for SaaS-wrapping is **unverified** (legal review before charging). Mandarin output quality is **untested by hand**.

---

## 2. Tech stack & repo layout

Monorepo, **pnpm + turbo**. Root: `C:\Users\Im_tHe_rEaL_LiM\source\repos\Inboudly`. Remote: `github.com/LimHuanYang/Inboudly` (branch `main`).

| Package | Stack | Role |
|---|---|---|
| `apps/api` | **NestJS** | REST API, all business logic, cron jobs |
| `apps/web` | **Next.js 15** (app router, RSC + client), TanStack Query v5, Tailwind + shadcn/ui, lucide-react | dashboard UI |
| `packages/shared` | Zod schemas + pure helpers | shared contracts (`@inboudly/shared`) |
| `packages/database` | **Prisma** → **Supabase Postgres** | schema + client (`@inboudly/database`) |

- **Media storage:** Cloudflare **R2** (`R2StorageService.putObject` → public URL).
- **Auth:** Supabase (`SupabaseAuthGuard`, `@CurrentUser`), multi-tenant by `workspaceId` (every query is workspace-scoped; `workspaces.assertMember` guards).
- **AI providers (BYOK, encrypted keys in `WorkspaceAiCredentials`):** `geminiKey`, `higgsfieldKey`, `pineconeKey`. Gemini = text + image + embeddings (`gemini-embedding-001`, 3072-dim). Higgsfield = AI video. HyperFrames = deterministic video (no key, local). Pinecone = brand-memory vectors (**dormant** — schema present, not wired live).
- **Dev commands:** `pnpm dev` (turbo, starts all watchers) · `pnpm type-check` · `pnpm --filter @inboudly/api test` (Jest) · `pnpm --filter @inboudly/database db:generate` / `db:push`.
- **Ports (dev):** web **:3000**, API **:3002** (`API_PORT=3002`; `/api/docs` Swagger). `NEXT_PUBLIC_API_URL` points at an ngrok tunnel in dev.
- **⚠️ Windows gotcha:** `prisma generate` throws `EPERM` on `query_engine-windows.dll.node` if a running node dev process holds the DLL — stop the Inboudly node procs first (filter CommandLine on `source\repos\Inboudly`; spare MCP/other node procs), then retry. Never `--force-reset` (wipes data).

---

## 3. The two hard external constraints

- **RedNote / Xiaohongshu (小红书) has NO open publish API** for a non-mainland entity (verified 3-0 vs official docs, 2026-06-16). Open-platform API requires a **mainland-China-registered company** (a MY/SG entity can't qualify). A verified *business account* (Blue-V) is possible but is **account verification, not API posting**. → **RedNote is content-prep only**: generate native bilingual 笔记, user posts manually / one-tap copy. Re-verify before building (policy is hedged "currently"). Details: `docs` memory dump §10 / `rednote-no-publish-api`.
- **Higgsfield** is used via its **own** direct API (`platform.higgsfield.ai`, auth `Authorization: Key api_key:api_key_secret`, async submit → `/requests/{id}/status`), **not** via Segmind/fal (direct is cheaper, all models, native webhooks). It's the *primary but swappable* AI-video renderer behind the `VideoProvider` abstraction — never a single point of failure.

---

## 4. What's BUILT (on `main`, chronological)

All merged to `main` and pushed to origin unless noted. Commit refs in `git log`.

### 4a. Foundation (2026-05-29 → 2026-06-09)
Video-generation backbone, composer + publishing, social connectors (LinkedIn, Facebook, YouTube, Instagram, TikTok), OAuth token-refresh, analytics + Pinterest scaffolding, settings, upload-your-own media. See `docs/superpowers/plans/2026-05-29..2026-06-09-*.md`.

### 4b. Creative-engine re-architecture (2026-06-18) — commits `81fd883`..`e02bd02`
Collapsed the AI stack to **Gemini (text+image+embeddings) + Higgsfield (video) only**; deleted 5 legacy video providers (Runway/Kling/Veo/Pollinations/OpenAI etc.); migrated embeddings OpenAI→Gemini; Settings + competitors UI → Gemini-only. Plan: `docs/superpowers/plans/2026-06-18-gemini-higgsfield-creative-engine.md`.

### 4c. Publishing workflow (2026-06-18) — commits `84b7ffd`..`5666d24`
The publish **trigger** was dead code (scheduled posts never published). Replaced with an **in-process `@Cron` publisher (NO Redis/BullMQ)**: scans due `SCHEDULED` posts, **atomically claims** (→`PUBLISHING`), publishes **per-platform + idempotently** (never re-fires a SUCCESS), **auto-retries** failed platforms (`retryCount`/`nextRetryAt` backoff), rolls up to `PUBLISHED`/`PARTIALLY_PUBLISHED`/`FAILED`, and a **stranded-`PUBLISHING` reaper**. Added `POST /:id/publish-now`, IDOR guards (`assertMember` on get/update/schedule/cancel), real per-platform language (EN/zh-CN). Dead BullMQ path deleted. Plan: `docs/superpowers/plans/2026-06-18-publishing-workflow.md`.

### 4d. Publishing UI (this session) — commits `0a6ab2e`..`2924c78`
The backend worked but the UI couldn't reach it. Built: a shared **`PostStatusBadge`** (all 9 statuses incl. `PARTIALLY_PUBLISHED`), calendar **status dots + live auto-refresh**, **"Publish now"** + confirm, a **post-detail page** (`/dashboard/posts/[id]`) with **per-platform publish status + retry**, fixed the dead calendar→composer link. Adversarial review caught 7 issues (false-success toast, failed posts vanishing off the calendar, inert live-poll, WCAG contrast, reduced-motion) — all fixed.

### 4e. Track A — post editing (this session) — commits `3ec3409`, `ed5f65d`
Composer loads an existing post via `?postId=`, hydrates state, and **`PUT /posts/:id`** replaces variants in a status-guarded transaction. Editable statuses: `DRAFT/SCHEDULED/FAILED/CANCELLED` (live ones bounce to the read-only detail page). Adversarial review caught **2 real bugs** — a **TOCTOU double-publish race** (status checked outside the txn; fixed with an atomic in-txn claim) and a **silent schedule-drop** on save — both fixed.

### 4f. Track B — HyperFrames branded video (this session) — commits `e1187cf`..`8508ed9`
Added **HyperFrames** (HeyGen, Apache-2.0 — deterministic HTML→MP4 via headless Chrome + FFmpeg) as a **second video engine** alongside Higgsfield. See §5. 14 code commits, subagent-driven TDD, adversarially reviewed (2 frontend blockers + 6 findings fixed). **116 API tests pass.**

---

## 5. Architecture you must know before touching video/publishing

**The video rails (provider-agnostic — this is why adding an engine is cheap):**
```
POST /ai/video (Higgsfield)  OR  POST /ai/video/template-video (HyperFrames)
  → VideoGenerationService.create* → VideoGeneration row (status GENERATING), void run() DETACHED
  → run() → adapterFor(provider) → provider.generate(apiKey, params)
       provider: render/generate MP4 → R2.putObject → MediaService.register (MediaAsset VIDEO)
  → job READY + mediaAssetId   |   @Cron('*/2 * * * *') reapStaleJobs: GENERATING > 10min → FAILED
  → composer polls GET /ai/video/:id → attaches mediaAsset to the PostVariant
```
- `VideoProvider` interface: `name`, `generate(apiKey, params): Promise<{asset:{id,url}, model}>`. Providers: `HiggsfieldVideoProvider`, `HyperframesVideoProvider`. Dispatch: `VideoGenerationService.adapterFor(provider)`.
- **NO Redis / BullMQ anywhere** — both video generation AND post publishing use in-process detached runners + `@Cron` reapers. The API **boots with queues disabled** (an old warning line still says "Scheduling off" — it is **stale/misleading**; the cron publisher runs regardless).

**The publish rails (media-source-agnostic):**
```
Post → PostVariant (one per platform) → PostMedia (ordered) → MediaAsset (R2 url)
PostScheduleCron.runDuePosts (EVERY_MINUTE) claims SCHEDULED→PUBLISHING → PostPublisherService.publishPost
  → per variant: connector.publish({account, media}) → PostPublication (SUCCESS/FAILED/RETRY_SCHEDULED)
  → rollup PUBLISHED / PARTIALLY_PUBLISHED / FAILED
retryFailed (EVERY_5_MIN) · reapStuckPublishing (EVERY_5_MIN, PUBLISHING>15min → FAILED)
```

**HyperFrames specifics (Track B):**
- Renders by **shelling out to the CLI**: `npx hyperframes render --variables-file vars.json --output out.mp4` (via `execFile` + `shell:true`, in a temp copy of the template dir). **Inline `--variables` JSON breaks under the Windows shell → always use `--variables-file`.**
- Templates live at `apps/api/src/modules/ai/video/template-video/templates/`. **Variable-driven `data-width/height` does NOT work** (the renderer reads them before the composition script runs) → we ship **one composition dir per aspect** (`bilingual-caption-9x16/-1x1/-16x9`, `launch-…`), resolved by `getTemplateDir(id, aspect)`. Variables declared on `<html data-composition-variables='[{id,type,label,default}]'>`, read at runtime via `window.__hyperframes.getVariables()`.
- Reuses the `VideoGeneration` table (`+ templateId, variables Json`), the detached runner, R2, `MediaAsset`, and the composer poller — nothing downstream changed. Determinism cache: `sha256(templateId + variables)` → reuse a prior READY render's `mediaAssetId`.
- **Deploy requirement:** the API runtime image must have **`npx hyperframes` + headless Chromium + FFmpeg** (present on the dev box: Node 24, FFmpeg 8.1.1). `nest-cli.json` copies the template HTML into `dist`.
- v1 = standalone branded clips (**bilingual caption** EN+中文, **launch** card). **B3 = chaining on Higgsfield footage (overlay via webm transparency) is DEFERRED** to its own spec.

---

## 6. What's PENDING (the roadmap, in priority order)

1. **Live smokes (highest — nothing has run end-to-end against reality):**
   - **Publishing:** no real post has published to a real platform (needs a connected social account + a Gemini key in a workspace).
   - **HyperFrames render:** no branded clip has gone through the full endpoint→CLI→R2→attach path live (unit tests mock the render; the B0 spike only proved the CLI renders standalone).
2. **Track C — Analytics loop + brand-memory moat (the strategic payoff / the flywheel):** insights-first (plain-language, not dashboards), each insight one-tap actionable ("this won → generate more like it"; "best time → schedule here"). Regular cron pulls of `PublicationMetrics`; normalize engagement across platforms into `viralityScore`. Then the **moat**: turn Pinecone on, cold-start seed (brand Q&A + 1-3 example posts + auto-import where the API allows: IG/FB, not RedNote/LinkedIn), embed → few-shot retrieval (platform-filtered), and weight winners from engagement. Design detail in §10 (`inboudly-build-roadmap`).
3. **B3 — HyperFrames chained on Higgsfield** (footage as moving background + branded overlay). Its own spec.
4. **Composer generation-first entry** (prompt-first + "Suggest ideas", evolving to a "drafts waiting" home as the moat matures) + **lean onboarding wizard** (3 steps: free Gemini key [the #1 drop-off cliff] → 2-3 brand questions + example posts → connect accounts [skippable]; ends by generating a first draft = the "wow").
5. **Minor cleanups / known bugs:** `M1` publish success-skip mis-counts if an account is reconnected mid-lifecycle; `M3` the `ScheduledJob` table is now orphaned/dead (remove); excise dormant OpenAI/Anthropic SDK imports in ancillary services; connector restructure (cut Pinterest, RedNote→prep-only) per positioning.
6. **Deferred to v1.1:** Higgsfield **avatar + voice** (needs a Mandarin TTS, e.g. MiniMax; Higgsfield Speak only lip-syncs supplied audio).
7. **Non-code:** legal review of **Higgsfield ToS** for SaaS wrapping before charging; **RedNote** legitimate-path exploration (mainland service-provider partnership?); **verify Mandarin** output quality by hand; **pricing** decision.

---

## 7. How work is done here (process conventions)

- **Skills-driven (superpowers):** `brainstorming` → `writing-plans` → `subagent-driven-development` (or inline) for any feature. Plans/specs saved under `docs/superpowers/{plans,specs}/YYYY-MM-DD-*.md`.
- **UI/UX:** the user wants the **`ui-ux-pro-max`** skill driving all UI decisions; align to the **existing shadcn/Tailwind tokens** (`success/warning/danger/info/secondary`) — **do not invent a new palette**. The user reviews design as **`.html` mockups in `docs/`** ("show me in .html" is a recurring request).
- **Grilling:** the user uses `/grill-me` to pressure-test decisions before building — expect to be interviewed one branch at a time.
- **Pre-merge adversarial review:** every substantial change gets a multi-agent adversarial review (reviewers find findings → 3-skeptic verification → fix confirmed ones) BEFORE merge. It has caught real bugs on every track — **keep doing it.**
- **Git:** branch per feature (`feat/…`), TDD with frequent commits, merge to `main` locally then push on the user's say-so. Commit trailer: `Co-Authored-By: Claude …`.

---

## 8. Document index (all under `docs/`)

**Living reference:** `ARCHITECTURE.md`, `PRODUCT-SPEC.md`, `DEPLOYMENT.md`, `GETTING-STARTED.md`, `USER-GUIDE.md`, `TESTING-CHECKLIST.md`, `README.md`, `inboudly-roadmap.md`.
**This session's visual docs (HTML):** `inboudly-recap-and-hyperframes-plan.html` (session recap + plan), `inboudly-publishing-changes.html`, `inboudly-publishing-ui-proposal.html`, `inboudly-hyperframes-track-b-design.html`, `hyperframes-explainer.html`, `hyperframes-vs-higgsfield.html`, `hyperframes-inboudly-integration.html` (⚠️ its BullMQ-worker claim is STALE — rendering uses the detached runner, not BullMQ), `inboudly-restructure.html`, `inboudly-post-workflow.html`, `inboudly-composer-options.html`, `inboudly-smoke-test-checklist.html`, `inboudly-plan-creative-engine.html`.
**Specs & plans:** `docs/superpowers/specs/*` and `docs/superpowers/plans/*` — one per feature, dated. Latest: `2026-06-24-hyperframes-template-video{,-design}.md`.

---

## 9. Quick-start for a new account

```bash
# 1. Install + generate
pnpm install
pnpm --filter @inboudly/database db:generate

# 2. .env (apps/api or root) needs: DATABASE_URL/DIRECT_URL (Supabase), ENCRYPTION_KEY,
#    R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_URL,
#    Supabase auth keys, API_PORT=3002, NEXT_PUBLIC_API_URL. (Real secrets are NOT in git.)

# 3. Run everything
pnpm dev            # web :3000, API :3002 (/api/docs)

# 4. Verify
pnpm type-check                      # 4/4 packages
pnpm --filter @inboudly/api test     # 116 tests

# For HyperFrames rendering: Node 22+, FFmpeg, and `npx hyperframes browser` (Chromium) must be present.
```

---

## 10. Memory dump (verbatim — re-seed the new account from this)

> These are the four `project`/`reference`/`feedback` memories that guided the work. Re-create them in the new account's memory (or import). Point-in-time — verify code claims.

### 10a. `inboudly-positioning` (project)
Inboudly's validated positioning (decided 2026-06-16 via grill-me + deep-research). Market: bilingual (EN+中文) SME owners & solo creators in SE Asia (MY/SG) — NOT Western cafe owners, NOT agencies/teams. Core job: beat the blank page (generation-first). Moat: compounding brand memory (learns voice from the user's own posts + engagement); no incumbent does this. Auto-post: LinkedIn + Facebook only. RedNote: content-prep only. AI: BYOK / never-the-biller, one free Gemini key (caption + image). Creative engine (2026-06-18): provider abstraction; **Gemini** = captions/images/embeddings; **Higgsfield's OWN API** = cinematic video (direct, NOT Segmind — cheaper, all models, native webhooks; Segmind/HeyGen kept only as documented fallbacks for avatar/lip-sync, which Higgsfield's direct API doesn't document). v1 = images+video; avatar+voice deferred to v1.1 (needs Mandarin TTS). Keys: `geminiKey`, `higgsfieldKey` (stored `api_key:api_key_secret`), `pineconeKey`. ⚠️ Higgsfield ToS for SaaS wrapping UNVERIFIED — legal review before charging. Mandarin quality untested. Why: the earlier video-provider thrashing was off-strategy churn; resolution = ONE renderer behind a swappable abstraction. Generation-first alone is table stakes; only brand-memory + bilingual-SEA + RedNote-native together is defensible. Caveat: the SEA bilingual gap is inferred, not measured — validate with users. Docs: `inboudly-restructure.html`, `2026-06-18-gemini-higgsfield-creative-engine.md`.

### 10b. `rednote-no-publish-api` (reference)
RedNote/Xiaohongshu offers NO open self-serve publish API (verified 3-0 vs official docs, 2026-06-16). Open-platform API needs the enterprise "service provider" role = mainland-China-registered company (MY/SG can't qualify). The "publishing" page is service-marketplace onboarding, not a post endpoint; a claimed "Enterprise Brand API" was refuted 0-3. A MY/SG company CAN register a verified business account (Blue-V, ~600 RMB) — that's verification, not API access. The only working cross-platform RedNote posting (open-source AiToEarn) uses unofficial Playwright + cookies (against ToS, ban risk). → RedNote = content-prep only. Re-verify before building (policy hedged "currently"). Open question: a legit path might exist via a mainland service-provider partnership — cost/contract unknown.

### 10c. `inboudly-build-roadmap` (project)
Publishing trigger FIXED + merged (2026-06-18). Dependency-ordered sequence: (1) Publishing ✅ → (2) Analytics loop → (3) Composer entry → (4) Moat rung 1 (history: Pinecone + cold-start seed + embed → few-shot) → (5) Moat rung 2 (engagement weights winners) → (6) generation-first "drafts waiting" home. **Analytics design:** insights-first (plain language, not dashboards); closed loop — every insight one-tap actionable ("this won → generate more like it" seeds composer + boosts weight; "best time → schedule here"); deterministic rules over `PublicationMetrics`, Gemini phrases EN/中文; normalize cross-platform engagement into `viralityScore`; regular cron pulls. **Composer:** prompt-first + "Suggest ideas" → generation-first home as the moat matures; per-platform presets (RedNote→中文 笔记, LinkedIn→EN professional, IG→EN punchy, FB→warm local); one idea → N native drafts; per-variant edit + regenerate. **Onboarding:** lean 3-step wizard (Gemini key [#1 drop-off] → brand Q&A + example posts → connect accounts [skippable]); ends by generating a first draft. **Brand-voice moat:** compounding + engagement; one brand voice per workspace expressed through per-platform presets; retrieval platform-filtered. **THE FLYWHEEL:** publish → analytics → "this won" → generate-more-like-it → brand memory → better draft → … one loop, no incumbent closes it.

### 10d. `use-ui-ux-pro-max-for-ui` (feedback)
When doing any UI/UX work, invoke the **ui-ux-pro-max** skill; tag decisions with the rule behind them. The app is Next.js + Tailwind + shadcn/ui (not React Native) — skip the skill's RN `search.py` CLI and align to the existing shadcn semantic tokens; **do NOT invent a new palette**. The user reviews UI proposals as `.html` mockups in `docs/`.

### 10e. `hyperframes-decision` (project)
HyperFrames (HeyGen, Apache-2.0, HTML→deterministic MP4) added as a **second video engine** alongside Higgsfield — complementary (Higgsfield = AI generative footage, paid, BYOK; HyperFrames = exact on-brand text/logo/CTA, free, local). Slots into `VideoProvider → VideoGeneration → MediaAsset → publish`. ⚠️ The old integration doc's **BullMQ** render-worker claim is STALE — use the detached in-process runner + `@Cron` reaper. Decided 2026-06-22: role = BOTH standalone + chained (standalone first); sequence = editing (A) → HyperFrames (B) → analytics (C); v1 templates = bilingual caption (EN+中文) + launch. **BUILT + merged 2026-06-24** (`e1187cf`..`8508ed9`): provider (CLI shell-out `--variables-file`), 2 templates × 3 aspect dirs (variable-driven sizing didn't work → per-aspect copies), `POST /ai/video/template-video`, determinism cache, composer "Branded clip" card; 116 API tests; reviewed. Deploy image needs `npx hyperframes` + Chromium + FFmpeg. **NOT verified live.** B3 (chaining) deferred.

---

*End of handoff. Keep this file updated as work continues — it is the portable source of truth.*
