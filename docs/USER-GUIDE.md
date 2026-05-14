# Inboudly — Complete User Guide

> A guide for **anyone** — no computer experience needed. If you can use a web browser and follow numbered steps, you can do this.

This guide is about **40 minutes long** if you go straight through. Take breaks. Tick the boxes as you go so you can resume later.

---

## Table of contents

1. [What is Inboudly?](#1-what-is-inboudly)
2. [What you'll need](#2-what-youll-need)
3. [Glossary — terms you'll see](#3-glossary--terms-youll-see)
4. [Part 1 — Install the building blocks on your computer](#part-1--install-the-building-blocks-on-your-computer)
5. [Part 2 — Sign up for the cloud services](#part-2--sign-up-for-the-cloud-services)
6. [Part 3 — Connect everything together](#part-3--connect-everything-together)
7. [Part 4 — Start Inboudly for the first time](#part-4--start-inboudly-for-the-first-time)
8. [Part 5 — Using Inboudly day-to-day](#part-5--using-inboudly-day-to-day)
9. [Part 6 — Troubleshooting](#part-6--troubleshooting)

---

## 1. What is Inboudly?

Inboudly is a website that helps you create and publish social media posts using Artificial Intelligence (AI).

**It can:**
- ✏️ Write your captions for you (in English **or** Chinese)
- 🎨 Generate the images for your posts
- 🎬 Take a long video (like a YouTube video) and automatically chop it into short clips for TikTok, Instagram, and RedNote
- 📅 Schedule posts to publish at specific times
- 🤖 Predict how well a post will do **before** you publish it
- 💬 Help you reply to comments

**Platforms supported in this version:** Instagram, TikTok, RedNote (小红书).

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   You type:                                     │
│   "Promote my new coffee shop"                  │
│                                                 │
│              ⬇                                  │
│                                                 │
│   Inboudly creates:                             │
│   ✓ Caption for Instagram                       │
│   ✓ Caption for TikTok                          │
│   ✓ Caption for RedNote (in Chinese)            │
│   ✓ A matching image                            │
│   ✓ Best hashtags for each platform             │
│   ✓ Score predicting how well it'll do          │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 2. What you'll need

### A computer
- A Windows, Mac, or Linux computer (this guide uses Windows)
- About **5 GB of free disk space**
- A reliable internet connection

### A credit/debit card
- For some accounts you'll create. **The total spending for testing is under $10.** You will not be charged anything you don't approve.

### About 40 minutes of focused time
- You can split this into chunks — checkpoint at each "Part" heading.

### An email address
- Use one you check often. You'll need to verify it for some services.

---

## 3. Glossary — terms you'll see

Don't worry if these look scary. You'll meet them all in context as you go.

| Word | What it means in plain English |
|---|---|
| **Terminal** / **PowerShell** | A black or blue text window where you type commands instead of clicking buttons. Like sending an SMS to your computer. |
| **Command** | A line of text you type into the terminal that tells the computer to do something. |
| **Install** | Add a piece of software to your computer (like installing an app on your phone). |
| **Server** | A program that runs in the background and answers requests. Inboudly has two: one for the website you see (`web`), one for the brain behind it (`api`). |
| **Browser** | Chrome, Edge, Firefox, Safari — the program you use to visit websites. |
| **Localhost** | Your own computer pretending to be a website. `localhost:3000` means "the website running right here on this machine, on door number 3000". |
| **API key** | A long secret password a service gives you so your code can talk to it. **Never share these.** |
| **`.env` file** | A text file that holds all your API keys in one place. |
| **Database** | Where Inboudly stores your data (your posts, your account, your settings). We use one called Supabase. |
| **Repository** / **Repo** | A folder containing all the project's code. |
| **Pnpm**, **Node**, **Git** | Tools we install in Part 1. They help run the code. |

---

## Part 1 — Install the building blocks on your computer

You're going to install three pieces of software. Think of them as the engine, transmission, and wheels of a car — none of them is Inboudly itself, but Inboudly needs them to run.

### 1.1 Install Node.js

Node.js is the engine that runs Inboudly's code.

**Step-by-step:**

1. Open your web browser
2. Go to **https://nodejs.org/en/download**
3. You'll see a download button — pick **"LTS"** (it stands for "Long Term Support" — the most stable version)
4. Click **"Windows Installer (.msi)" → 64-bit**

> 📸 *Image to add later: screenshot of nodejs.org download page with "LTS" highlighted*

5. The file downloads. Open it (usually in your `Downloads` folder)
6. The installer pops up. Click **Next** through every screen — accept all defaults
7. When it asks "Tools for Native Modules", you can **uncheck** that box (we don't need it)
8. Click **Install**
9. Windows might ask "Do you want to allow this app to make changes?" — click **Yes**
10. Wait until "Completed" appears, then click **Finish**

**Test it worked:**

11. Click the Windows Start button
12. Type `powershell` — you'll see "Windows PowerShell" appear
13. Click on it. A blue or black window opens.

> 📸 *Image to add: screenshot showing Windows PowerShell in Start menu search results*

14. Type exactly:
    ```
    node --version
    ```
15. Press Enter
16. You should see something like `v20.18.0` or higher

**If you see `'node' is not recognized as an internal or external command`:**
- Close PowerShell
- Reboot your computer (yes, really — Windows needs to refresh after installing Node)
- Try again from step 11

---

### 1.2 Install pnpm

pnpm is a faster, smarter way to install the smaller pieces of code Inboudly needs.

**Step-by-step:**

1. PowerShell should still be open from above. If not, reopen it (Start → type `powershell`)
2. Type exactly:
    ```
    npm install -g pnpm@9.12.0
    ```
3. Press Enter
4. Wait about 30 seconds. You'll see some text scroll by.
5. Test it worked:
    ```
    pnpm --version
    ```
6. You should see `9.12.0`

**If you see a red error about "execution policy":**

This is a Windows security setting. To fix it:
1. Close PowerShell
2. Right-click the Windows Start button
3. Click **"Windows PowerShell (Admin)"** or **"Terminal (Admin)"**
4. Click **Yes** when Windows asks for permission
5. Type exactly and press Enter:
    ```
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
    ```
6. Type `Y` and press Enter
7. Close, reopen PowerShell normally, try the pnpm install command again

---

### 1.3 Install Git

You probably already have Git from when we connected to GitHub earlier. Test:

1. In PowerShell, type:
    ```
    git --version
    ```
2. If you see `git version 2.something`, you're done.
3. If not, download and install Git from **https://git-scm.com/download/win** (defaults are fine)

---

✅ **Part 1 complete!** You now have Node.js, pnpm, and Git. Your computer can now run Inboudly's code.

---

## Part 2 — Sign up for the cloud services

Inboudly relies on a few cloud services for things it can't do alone (storing data, generating AI text, etc.). All have free tiers — you'll spend a few dollars at most across all of testing.

You'll have a notepad open and write down each "API key" you get. **API keys are like passwords — keep them private.**

> 💡 **Tip:** Keep this list of keys in a Notepad file you save to your Documents folder. You'll need them in Part 3.

---

### 2.1 Supabase (database + login system) — FREE

Supabase stores all your Inboudly data and handles user logins.

**Sign up:**

1. Open browser → **https://supabase.com/dashboard/sign-up**
2. Click "Sign up with GitHub" (fastest) or use email
3. Once logged in, click **"New project"** (big green button)

> 📸 *Image to add: Supabase dashboard "New project" button*

4. Fill in:
   - **Name:** `inboudly`
   - **Database Password:** Click "Generate a password" — **COPY THIS PASSWORD** to your notepad. You won't see it again.
   - **Region:** Pick the one closest to you (Singapore for Asia)
   - **Plan:** Free
5. Click **"Create new project"**
6. Wait 2-3 minutes while it sets up

**Get the keys you need:**

7. Once the project loads, click the ⚙️ **Settings** icon in the left sidebar
8. Click **"Database"** in the settings menu
9. Scroll down to **"Connection string"** section
10. You'll see two tabs: **"Connection pooling"** (also called "Pooled") and **"Direct connection"**
11. Pooled tab → copy the connection string → in your notepad, label it `DATABASE_URL`
12. Direct tab → copy that one too → label it `DIRECT_URL`
13. Both URLs will have `[YOUR-PASSWORD]` in them — replace that placeholder with the actual password you saved in step 4

> 📸 *Image to add: Supabase Connection Pooling tab with connection string highlighted*

14. Now click **"API"** in the settings menu (still in left sidebar)
15. Copy three things to your notepad:
    - **Project URL** → label it `SUPABASE_URL`
    - **anon public** key → label it `SUPABASE_ANON_KEY`
    - **service_role** key (click "Reveal" to see it) → label it `SUPABASE_SERVICE_ROLE_KEY`

✅ Supabase done.

---

### 2.2 Anthropic (the AI that writes captions) — Costs $5 to start

Claude is the AI that writes Inboudly's captions and helps with other smart features.

**Sign up:**

1. Browser → **https://console.anthropic.com/login**
2. Sign up with email or Google
3. Verify your email if prompted

**Add credit:**

4. Click your name (top right) → **"Plans & Billing"**
5. Click **"Buy credits"** (or "Add credits")
6. Enter $5 and your card details
7. This $5 will last for hundreds of test generations

**Get your key:**

8. Click your name → **"API Keys"**
9. Click **"Create Key"** → name it `inboudly-test` → click "Create Key"
10. **COPY THE KEY IMMEDIATELY** — you cannot see it again. In your notepad, label it `ANTHROPIC_API_KEY`

✅ Anthropic done.

---

### 2.3 OpenAI (image generation + transcription) — Pay-as-you-go

OpenAI provides image generation (GPT Image) and audio transcription (Whisper). Costs are tiny — under $1 for testing.

**Sign up:**

1. Browser → **https://platform.openai.com/signup**
2. Sign up with email or Google
3. Verify your phone number if asked

**Add a payment method:**

4. Click the ⚙️ icon (top right) → **"Billing"**
5. Add payment method
6. Optionally add $5 of prepaid credit (recommended — caps your spend)

**Get your key:**

7. Click ⚙️ → **"API keys"**
8. Click **"Create new secret key"**
9. Name: `inboudly-test`, Permissions: All
10. **COPY THE KEY** → in notepad, label it `OPENAI_API_KEY`

✅ OpenAI done.

---

### 2.4 Upstash (Redis — for scheduling posts) — FREE — *Skip if Tier 1 only*

Only needed if you want to test scheduling posts to fire later.

1. Browser → **https://console.upstash.com/login**
2. Sign up with GitHub or email
3. Click **"Create Database"**
4. Name: `inboudly-redis`, Region: Singapore (or closest), Type: Regional, Plan: Free
5. Click Create
6. Once created, scroll to **"Connect"** section
7. Pick the **"redis://"** option (not REST)
8. Copy the URL → in notepad, label it `REDIS_URL`

✅ Upstash done.

---

### 2.5 Cloudflare R2 (file storage) — FREE — *Skip if Tier 1 only*

Only needed for the repurpose engine and image uploads.

1. Browser → **https://dash.cloudflare.com/sign-up**
2. Sign up
3. Once logged in, the dashboard shows "Account ID" in the right sidebar — copy this → label it `R2_ACCOUNT_ID`

> 📸 *Image to add: Cloudflare dashboard with Account ID highlighted in sidebar*

4. Left sidebar → **"R2 Object Storage"**
5. Click "Enable R2" (no card required for free tier)
6. Click **"Create bucket"**
7. Name: `inboudly-media` → leave defaults → Create
8. Back in R2 sidebar, click **"Manage R2 API Tokens"**
9. Click **"Create API token"**
10. Name: `inboudly`, Permissions: **Object Read & Write**, leave bucket as "All buckets"
11. Click Create
12. Copy:
    - **Access Key ID** → label it `R2_ACCESS_KEY_ID`
    - **Secret Access Key** → label it `R2_SECRET_ACCESS_KEY`

✅ Cloudflare done.

---

### 2.6 Pinecone (AI memory for brand voice) — FREE — *Skip if Tier 1 or 2 only*

1. Browser → **https://app.pinecone.io**
2. Sign up
3. Click **"Create Index"**
4. Settings:
   - **Name:** `inboudly-brand-voices`
   - **Dimensions:** `3072`
   - **Metric:** `cosine`
   - **Cloud:** AWS (any region)
   - **Plan:** Free / Starter
5. Click Create Index, wait ~1 min
6. Sidebar → **"API Keys"** → copy default key → label it `PINECONE_API_KEY`

✅ Pinecone done.

---

✅ **Part 2 complete!** You should now have a list in your notepad that looks like this:

```
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
SUPABASE_URL=https://....supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
REDIS_URL=redis://default:...           (optional)
R2_ACCOUNT_ID=...                        (optional)
R2_ACCESS_KEY_ID=...                     (optional)
R2_SECRET_ACCESS_KEY=...                 (optional)
PINECONE_API_KEY=...                     (optional)
```

---

## Part 3 — Connect everything together

You'll now put all those keys into Inboudly's configuration files.

### 3.1 Find the Inboudly folder

1. Open File Explorer (Windows key + E)
2. Navigate to: `C:\Users\Im_tHe_rEaL_LiM\source\repos\Inboudly`

> 📸 *Image to add: File Explorer showing the Inboudly folder contents*

### 3.2 Create the main `.env` file

1. In that folder, find the file called **`.env.example`**
2. Right-click it → **Copy**
3. Right-click on empty space → **Paste**
4. You'll see `.env.example - Copy`. Right-click → **Rename** → change it to exactly **`.env`** (with the dot at the start, no other extension)
5. Windows might warn "If you change a file name extension..." — click **Yes**

> ⚠️ **Make sure the file is named just `.env`, not `.env.txt` or `.env.example - Copy`. The dot is important.**

### 3.3 Edit `.env` with your keys

1. Right-click `.env` → **Open with** → **Notepad**
2. You'll see lots of placeholder values like `DATABASE_URL="postgresql://postgres:password@localhost..."`
3. **Replace each one** with the values from your notepad. Keep the format `KEY=value` with no spaces around the `=`.

For example, change:
```
ANTHROPIC_API_KEY="sk-ant-..."
```
to:
```
ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXXX...your-real-key
```

(You can keep or remove the quotes — both work)

4. Save the file (Ctrl+S) and close Notepad

### 3.4 Create the web app's `.env.local`

1. In File Explorer, navigate into `apps` → `web`
2. Right-click empty space → New → Text Document
3. Name it exactly **`.env.local`** (Yes to extension warning)
4. Right-click → Open with Notepad
5. Paste in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
   NEXT_PUBLIC_API_URL=http://localhost:3001
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
6. Replace the first two values with the same Supabase URL and anon key from your notepad
7. Save and close

✅ **Part 3 complete!** Your keys are now configured.

---

## Part 4 — Start Inboudly for the first time

### 4.1 Open PowerShell in the Inboudly folder

1. In File Explorer, navigate to `C:\Users\Im_tHe_rEaL_LiM\source\repos\Inboudly`
2. Click in the **address bar** at the top (the path field)
3. Delete what's there and type `powershell`
4. Press Enter

A PowerShell window opens **already in the right folder**.

> 📸 *Image to add: File Explorer with "powershell" typed in the address bar*

### 4.2 Install Inboudly's dependencies

In PowerShell, type and press Enter after each command:

```
pnpm install
```

This downloads all the small bits of code Inboudly needs. **First time takes 3-5 minutes.** You'll see lots of text scrolling — that's normal. Wait for the prompt to come back (a fresh line ready for typing).

### 4.3 Set up the database

```
pnpm db:generate
```

(takes ~10 seconds — generates code for talking to Supabase)

```
pnpm db:push
```

(takes ~30 seconds — creates all the tables in your Supabase database)

You should see "Database is in sync with your schema" or similar at the end.

### 4.4 Start Inboudly

```
pnpm dev
```

Wait. After 30-60 seconds you should see two lines like:

```
✓ Web ready - http://localhost:3000
✓ Inboudly API running on http://localhost:3001
```

🎉 **Inboudly is running.** Leave this PowerShell window open. Closing it stops Inboudly.

### 4.5 Open it in your browser

1. Open Chrome, Edge, or any browser
2. Go to: **http://localhost:3000**

You should see the Inboudly landing page with the pink "Get started" button.

> 📸 *Image to add: Inboudly landing page in browser*

✅ **Part 4 complete!** Inboudly is running on your computer.

---

## Part 5 — Using Inboudly day-to-day

This part walks you through what to actually do once Inboudly is running.

### 5.1 Create your account

1. On the landing page, click **"Get started"** (top right)
2. Fill in:
   - **Workspace name** — your business name, e.g. "Golden Coffee Co."
   - **Your name** — your full name
   - **Email** — your email
   - **Password** — at least 8 characters
3. Click **"Create account"**

You'll be redirected to the Dashboard. **You're in.**

### 5.2 The Dashboard — what each section does

The left sidebar has 8 sections:

```
┌──────────────┐
│ 🏠 Overview  │  ← Stats: posts, scheduled, followers
│ ✨ Composer  │  ← Where you create new posts (the main feature!)
│ 🪄 Repurpose │  ← Turn long videos into short clips
│ 📅 Calendar  │  ← See all scheduled posts on a calendar
│ ✅ Approvals │  ← Posts waiting for client/manager approval
│ 🖼  Media    │  ← Your library of images and videos
│ 💬 Inbox     │  ← Comments and DMs from your platforms
│ 📊 Analytics │  ← Performance numbers
│ ⚙️ Settings  │  ← Connect social accounts, brand kit
└──────────────┘
```

### 5.3 Create your first post (the WOW moment)

1. Click **Composer** in the left sidebar
2. At the top, you'll see chips: Instagram, TikTok, RedNote. Click each one to select/deselect
3. Choose **Instagram** for your first post (most familiar)

#### Generate a caption with AI

4. Scroll down to the **"Generate caption with AI"** card
5. In the box, type what your post is about. Be specific. Examples:
   - `"New summer iced latte launch — promote Saturday opening"`
   - `"Behind-the-scenes of our barista training day"`
   - `"Customer testimonial — Sarah from Marketing Bay"`
6. Click **"Generate Instagram caption"**
7. Wait 5-10 seconds. The caption + hashtags will appear in the editor at the top.

> 📸 *Image to add: Composer with generated caption visible in editor*

#### Watch the Virality Score react

8. Look at the right side of the screen. You'll see:
   - **Virality Score** — a number 0-100 that updates as you edit
   - **Algorithm Coach** — specific advice ("add more hashtags", "your hook is weak", etc.)
9. Try editing the caption — delete a sentence, add an emoji, change a hashtag. Watch the score change.

#### Generate an image

10. Scroll down to **"Generate image with AI"** card
11. Describe the image you want, e.g. `"Iced latte with condensation on a wooden table, morning sunlight, minimalist style"`
12. Pick aspect ratio — **4:5 (Portrait)** for Instagram is best
13. Click **"Generate 1 image"**
14. Wait 10-20 seconds. The image appears below.
15. Click the image to attach it to your Instagram post (it shows "ATTACHED" in pink)

### 5.4 Try RedNote (the Chinese platform that nobody else supports)

1. In the composer, click the **RedNote** chip at the top
2. Click the small **"R"** button to switch the active platform to RedNote
3. In the AI prompt, type in Chinese (or English — Inboudly will translate):
   `推广我们新出的冰拿铁，周六开张`
   (or English: `New iced latte launch, opening Saturday`)
4. Click "Generate RedNote caption"
5. The caption appears in **Simplified Chinese**, formatted for RedNote's specific algorithm
6. Check the Algorithm Coach — it gives you RedNote-specific advice (CES scoring, keyword placement, search intent)

**This is what no other Western tool does.**

### 5.5 Connect a social account (so you can actually publish)

> Note: For real publishing, you need to apply for platform API access. See `docs/TESTING-CHECKLIST.md` Tier 4. For testing, you can skip this and just save drafts.

1. Click **Settings** in the sidebar
2. Scroll to "Connected accounts"
3. Click **"Connect INSTAGRAM"** — a popup opens
4. (For testing without real platform credentials, this will fail — that's expected)
5. Once you have real Meta/TikTok/RedNote credentials in your `.env`, the popup will let you log in to that platform and authorize Inboudly

### 5.6 Schedule a post

1. After creating a post in the composer, click **"Schedule"** (when this UI is added — for now, use the API)
2. Pick a date and time
3. The post will appear on the **Calendar** page
4. At the scheduled time, Inboudly will publish it automatically

### 5.7 Approval workflow (for agencies / clients)

1. Create a post → mark it as needing approval
2. Go to **Approvals** page
3. Click on the post → fill in the client's email → click "Send"
4. Click **"Copy review link"**
5. Send that link to your client (email, WhatsApp, etc.)
6. Your client opens the link — **they don't need an account** — and clicks Approve / Request Changes / Reject
7. Back in Approvals, you see their decision instantly

### 5.8 Repurpose a long video

1. Click **Repurpose** in sidebar
2. Pick **YouTube URL** as the source
3. Paste a YouTube link (try a 2-3 minute video first)
4. Select target platforms (TikTok, Instagram)
5. Set "Clips per platform" to 2
6. Tick "Burn in captions"
7. Click **"Generate clips"**
8. A progress bar appears — wait 2-5 minutes
9. When done, go to **Media** → see the new short clips with captions baked in

---

## Part 6 — Troubleshooting

### "Page won't load — localhost:3000 doesn't open"
- Check the PowerShell window. Did `pnpm dev` finish? You should see "Web ready" and "API running" lines.
- If PowerShell shows red errors, screenshot them and check the troubleshooting list below.

### "I see a database error when signing up"
- The database schema isn't pushed. Stop the server (Ctrl+C in PowerShell), run `pnpm db:push`, then `pnpm dev` again.

### "AI generation fails"
- Check your `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are pasted correctly (no extra spaces, no quote marks unless they were there in the example file)
- Check you have credit: anthropic.com → Plans & Billing, platform.openai.com → Billing

### "Image generation says 'unauthorized'"
- Your `OPENAI_API_KEY` is wrong. Make a new one at platform.openai.com.

### "I get an error about pnpm not found"
- You skipped Part 1.2. Go back and install pnpm.

### "node_modules folder not found" or "cannot find module"
- You skipped `pnpm install`. Run it.

### "I closed PowerShell and now Inboudly is offline"
- Just reopen PowerShell in the Inboudly folder (Part 4.1) and run `pnpm dev` again. No need to install anything again.

### "I want to stop Inboudly"
- In the PowerShell window running Inboudly, press **Ctrl+C** then type `Y` if asked.

### "The website looks broken / no styles"
- Hard refresh your browser: **Ctrl+Shift+R**
- If still broken, restart `pnpm dev`

### "Where do I see what users have signed up?"
- Open your Supabase dashboard → Table Editor → click on the `User` table → see all rows

### "How do I delete my data and start over?"
- Supabase dashboard → SQL Editor → paste `TRUNCATE TABLE "User" CASCADE;` → run

---

## Quick reference — most useful commands

| What you want | Type in PowerShell |
|---|---|
| Start Inboudly | `pnpm dev` |
| Stop Inboudly | Ctrl+C |
| Update the database after schema changes | `pnpm db:push` |
| Visual database editor | `pnpm db:studio` |
| Reinstall everything | `pnpm install` |

---

## What's next after testing

Once you're happy:
1. **Buy the domain** `inboudly.com` (or another)
2. Follow `docs/DEPLOYMENT.md` to put Inboudly online
3. Apply for real Instagram + TikTok + RedNote API access (takes days/weeks)
4. Onboard your first real users

---

🎉 **You did it.** You set up a full AI-powered SaaS platform from zero. That's something that costs companies tens of thousands to build — you just got it running on your laptop.
