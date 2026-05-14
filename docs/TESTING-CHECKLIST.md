# Inboudly — Testing Checklist

Everything you need to set up, install, sign up for, or click through **outside** of Claude / this codebase to test Phase 1 end-to-end.

> Print this page. Tick boxes as you go. The tiers below build on each other — you can stop at any tier and the parts you've completed will work.

---

## A. Pre-flight — accounts you must create

These are external services Inboudly depends on. All have free tiers sufficient for testing.

### 🟢 Required for Tier 1 (just to see it run)

- [ ] **Supabase account** — https://supabase.com/dashboard/sign-up
  - Sign up with Google or GitHub (faster)
  - Create a new project (region: closest to you, e.g. Singapore for Asia)
  - Set a strong database password — **save it somewhere you can find later**
  - Wait ~2 min for the project to provision

- [ ] **Anthropic account** — https://console.anthropic.com/login
  - Sign up
  - Add $5 of credit (Settings → Billing) — generous for hundreds of test generations
  - Settings → API Keys → Create Key → copy and save it

- [ ] **OpenAI account** — https://platform.openai.com/signup
  - Sign up
  - Settings → Billing → Add payment method (you'll spend pennies during testing)
  - Settings → API Keys → Create new secret key → copy and save it

### 🟡 Required for Tier 2 (scheduled posts)

- [ ] **Upstash account** — https://console.upstash.com/login
  - Sign up
  - Create Database → Region: Singapore (or closest) → Type: Regional → Plan: Free
  - Copy the **Redis URL** (starts with `redis://default:...`) — save it

### 🟡 Required for Tier 3 (repurpose engine)

- [ ] **Cloudflare account** — https://dash.cloudflare.com/sign-up
  - Sign up
  - In sidebar: R2 Object Storage → Enable (no card needed for free tier)
  - Create bucket: `inboudly-media`
  - In R2 sidebar: Manage R2 API Tokens → Create API Token → Permissions: Object Read & Write → save the Access Key ID + Secret Access Key
  - Note your **Account ID** (top-right of dashboard, copy it)

- [ ] **Pinecone account** — https://app.pinecone.io
  - Sign up
  - Create Index: name = `inboudly-brand-voices`, dimensions = `3072`, metric = `cosine`, free tier
  - Settings → API Keys → copy the key

### 🔴 Required for Tier 4 (real publishing — skip for first test)

- [ ] **Meta Developer account** — https://developers.facebook.com (Instagram + Facebook publishing)
- [ ] **TikTok for Developers** — https://developers.tiktok.com
- [ ] **RedNote third-party API key** — https://xiaohongshu.apifox.cn

---

## B. Software you must install on your computer

### Required for any tier

- [ ] **Node.js v20 or newer** — https://nodejs.org/en/download
  - Download the LTS Windows installer
  - Run installer with default settings
  - **Reboot** if it asks
  - Verify: open PowerShell, run `node --version` → should show `v20.x.x` or higher

- [ ] **pnpm** — open PowerShell, run:
  ```powershell
  npm install -g pnpm@9.12.0
  ```
  - Verify: `pnpm --version` → should show `9.12.0`

- [ ] **Git** (already installed if you used GitHub before)
  - Verify: `git --version` → should show `git version 2.x`
  - If missing: https://git-scm.com/download/win

### Required only for Tier 3 (repurpose engine)

- [ ] **FFmpeg**
  ```powershell
  winget install ffmpeg
  ```
  - **Close and reopen PowerShell**
  - Verify: `ffmpeg -version` → should print version info

- [ ] **yt-dlp**
  ```powershell
  winget install yt-dlp
  ```
  - **Close and reopen PowerShell**
  - Verify: `yt-dlp --version` → should print a date-version like `2025.01.15`

---

## C. Configuration you must do manually

- [ ] Open the Inboudly project folder in File Explorer:
  `C:\Users\Im_tHe_rEaL_LiM\source\repos\Inboudly`

- [ ] Make a copy of `.env.example` and rename the copy to `.env`
  (right-click `.env.example` → Copy → Paste → rename to `.env` — keep the dot at the start)

- [ ] Open `.env` in Notepad (or VS Code if installed) and paste in the keys you collected from section A:
  ```
  DATABASE_URL=                          # from Supabase → Database → Pooled connection
  DIRECT_URL=                            # from Supabase → Database → Direct connection
  SUPABASE_URL=                          # from Supabase → Settings → API → Project URL
  SUPABASE_ANON_KEY=                     # from Supabase → Settings → API → anon public
  SUPABASE_SERVICE_ROLE_KEY=             # from Supabase → Settings → API → service_role
  NEXT_PUBLIC_SUPABASE_URL=              # same as SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY=         # same as SUPABASE_ANON_KEY
  ANTHROPIC_API_KEY=                     # from Anthropic console
  OPENAI_API_KEY=                        # from OpenAI platform
  REDIS_URL=                             # from Upstash (Tier 2) — leave blank for Tier 1
  PINECONE_API_KEY=                      # from Pinecone (Tier 3) — leave blank otherwise
  PINECONE_INDEX=inboudly-brand-voices
  R2_ACCOUNT_ID=                         # from Cloudflare (Tier 3)
  R2_ACCESS_KEY_ID=                      # from Cloudflare R2 token (Tier 3)
  R2_SECRET_ACCESS_KEY=                  # from Cloudflare R2 token (Tier 3)
  R2_BUCKET=inboudly-media
  ```

- [ ] Save and close the file

- [ ] Also create `apps/web/.env.local` with:
  ```
  NEXT_PUBLIC_SUPABASE_URL=              # same value
  NEXT_PUBLIC_SUPABASE_ANON_KEY=         # same value
  NEXT_PUBLIC_API_URL=http://localhost:3001
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```

---

## D. First-run install + start

Open PowerShell **in the Inboudly folder**:

```powershell
cd C:\Users\Im_tHe_rEaL_LiM\source\repos\Inboudly
pnpm install
pnpm db:generate
pnpm db:push
pnpm dev
```

- `pnpm install` — first time will take 2-5 min. Don't worry about the warnings.
- `pnpm db:push` — pushes the schema to Supabase. You should see "Database is in sync".
- `pnpm dev` — starts both servers. Wait until you see both `Local:   http://localhost:3000` and `Inboudly API running on http://localhost:3001`.

**Leave this PowerShell window open** — closing it stops the servers.

---

## E. Tier 1 — UI smoke test (no real publishing)

Open Chrome / Edge and click through each in order. Tick when each one works.

- [ ] **Landing page loads** — http://localhost:3000
  - Hero "AI-native social media, built for the next decade"
  - 6 feature cards visible
  - Header has "Sign in" and "Get started" buttons

- [ ] **Sign up flow** — click "Get started"
  - Fill workspace name, your name, email, password
  - Submit
  - Should redirect to `/dashboard` automatically
  - Toast says "Welcome to Inboudly!"

- [ ] **Dashboard renders** — `/dashboard`
  - Shows "Welcome back, [your first name]"
  - Four stat tiles (Published, Scheduled, Drafts, Followers)
  - "No accounts connected yet" message

- [ ] **Composer text generation** — `/dashboard/composer`
  - Click Instagram chip — turns pink
  - Type in "Generate caption with AI" → e.g. "Promote new summer skincare line"
  - Click "Generate Instagram caption"
  - Caption + hashtags should appear in the editor above
  - Right side: Virality Score should show a number 0-100

- [ ] **Algorithm Coach reacts in real-time**
  - Delete the caption — coach should warn about empty caption
  - Type something very short — coach warns about length
  - Switch to RedNote tab — different advice appears (CES scoring, search intent)

- [ ] **Image generation**
  - In composer, scroll to "Generate image with AI"
  - Type: "minimalist skincare bottle on marble with rosemary"
  - Pick aspect 1:1, count 1
  - Click Generate
  - Image should appear in the gallery below — click it to attach to the active platform

- [ ] **Calendar** — `/dashboard/calendar`
  - Month grid renders
  - Today's date is circled in pink
  - Prev/next/today buttons work

- [ ] **Inbox** — `/dashboard/inbox`
  - Filter chips work (clicking them toggles)
  - "No comments yet" message

- [ ] **Approvals** — `/dashboard/approvals`
  - "Nothing pending approval" message

- [ ] **Repurpose** — `/dashboard/repurpose`
  - 4 source-type cards (Upload, YouTube, Podcast, Blog)
  - Picking one selects it (border turns pink)
  - Form fields appear

- [ ] **Settings** — `/dashboard/settings`
  - Connected accounts: empty
  - "Connect Instagram", "Connect TikTok", "Connect REDNOTE" buttons visible

- [ ] **API docs** — http://localhost:3001/api/docs
  - Swagger UI loads with all endpoints organised by tag

---

## F. Tier 2 — Scheduling + approvals

Add `REDIS_URL` from Upstash to `.env`, restart `pnpm dev`.

- [ ] **Schedule a post via API**
  - Open http://localhost:3001/api/docs
  - Find `POST /api/v1/posts`
  - Click "Try it out"
  - In Authorize (top right) — paste your Supabase access token (get it from browser DevTools → Application → Cookies → `sb-...-auth-token`, the `access_token` field)
  - Submit a body like:
    ```json
    {
      "workspaceId": "YOUR_WORKSPACE_ID",
      "title": "Test scheduled post",
      "scheduledFor": "2026-05-14T14:30:00.000Z",
      "variants": [
        { "platform": "INSTAGRAM", "caption": "Hello world", "hashtags": ["test"] }
      ]
    }
    ```
  - Should return a created post with status `SCHEDULED`

- [ ] **Watch the publish job fire**
  - At the scheduled time, the API terminal should print `Publishing post ...`
  - Status will update to `PUBLISHING` then `FAILED` (because no platform connected yet — that's expected)

- [ ] **Approval workflow end-to-end**
  - In dashboard, go to `/dashboard/composer` and create a draft (just save, don't schedule)
  - Use API docs `POST /api/v1/approvals` to create a workflow with `generateShareableLink: true`
  - Go to `/dashboard/approvals` — your post appears with "Copy review link" button
  - Click "Copy review link"
  - Open the URL in an **incognito window** (Ctrl+Shift+N in Chrome)
  - You should see the post **without logging in**
  - Click "Approve" — toast confirms
  - Back in your normal browser, refresh `/dashboard/approvals` — workflow now shows APPROVED

---

## G. Tier 3 — Repurpose engine

Add Pinecone + R2 keys to `.env`. Make sure ffmpeg + yt-dlp are installed (section B). Restart `pnpm dev`.

- [ ] **Brand voice training**
  - In API docs, find `POST /api/v1/brand/voices/{id}/train`
  - Get your default brand voice ID from `/api/v1/brand/voices?workspaceId=...`
  - Train with a few past posts:
    ```json
    {
      "examples": [
        { "text": "Your real past Instagram caption #1", "platform": "INSTAGRAM" },
        { "text": "Your real past Instagram caption #2", "platform": "INSTAGRAM" },
        { "text": "Your real past Instagram caption #3", "platform": "INSTAGRAM" }
      ]
    }
    ```
  - Should return `{ "ingested": 3 }`
  - Now go back to the composer → generate a caption → notice it now sounds more like your training examples

- [ ] **Repurpose YouTube video**
  - Go to `/dashboard/repurpose`
  - Pick "YouTube URL"
  - Paste a short YouTube link (try something 2-3 minutes for first test, e.g. a TED-Ed clip)
  - Select TikTok + Instagram
  - Clip count: 2
  - Click "Generate clips"
  - Watch progress bar climb (5% → 20% transcribe → 40% Claude → 100% ffmpeg done)
  - Takes 2-5 min for a short video

- [ ] **Find the clips**
  - Go to `/dashboard/media`
  - Should see new VIDEO assets with "Repurposed" badge
  - Click thumbnails — should preview the cropped 9:16 clips with burn-in captions

---

## H. Tier 4 — Real social publishing (skip on first test)

This requires platform approval which takes days. Only attempt when you're ready to onboard real users.

- [ ] **Meta App** — Create at developers.facebook.com → Add Instagram product → request `instagram_content_publish`, `pages_show_list`, `pages_read_engagement` → submit for App Review
- [ ] **TikTok app** — developers.tiktok.com → request `video.publish` scope (without it, you're stuck in `UPLOAD_TO_INBOX` mode where posts go to user's drafts)
- [ ] **RedNote** — Sign up with the third-party provider, get an API key

Once approved, paste keys into `.env`, restart, then:
- [ ] Settings → "Connect INSTAGRAM" → popup OAuth flow → returns to dashboard with the account listed as ACTIVE
- [ ] Same for TIKTOK
- [ ] Composer → write a post → schedule for 1 minute from now → wait → check Instagram → it's published

---

## I. Bug report template

When something breaks, paste this into a GitHub issue:

```
**What I was doing**
(e.g. "Generated a caption on the composer page")

**What I expected**
(e.g. "A caption to appear in the editor")

**What actually happened**
(e.g. "Page froze, no caption appeared")

**Browser console errors** (F12 → Console tab)
(paste any red text)

**API terminal output**
(copy any red error from the PowerShell window running pnpm dev)

**My setup tier**
(e.g. "Tier 1 — Supabase + Anthropic + OpenAI only, no Redis yet")
```

---

## Estimated total time

| Tier | What you can test | Your time | Cost |
|---|---|---|---|
| Tier 1 | UI + AI text + AI image + Virality Score + Algorithm Coach | 30 min | ~$5 (Anthropic credit) |
| Tier 2 | + scheduling + approval workflow | +15 min | $0 (Upstash free) |
| Tier 3 | + brand voice training + repurpose engine | +30 min | ~$2 (Whisper + GPT image) |
| Tier 4 | + real publishing to social platforms | days/weeks | $0 once approved |
