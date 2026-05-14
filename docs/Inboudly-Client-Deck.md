---
marp: true
theme: default
class: invert
paginate: true
backgroundColor: "#0D1B2A"
color: "#ffffff"
header: "Inboudly · Confidential"
footer: ""
style: |
  section { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
  h1, h2, h3 { color: #ffffff; }
  h3 { color: #FF3D7F; }
  strong { color: #FF3D7F; }
  em { color: #F5C518; font-style: normal; }
  table { width: 100%; font-size: 0.7em; }
  th { color: #FF3D7F; }
  blockquote { border-left: 4px solid #FF3D7F; }
---

<!-- _class: invert lead -->
# Inboudly
## AI-native social media, built for the next decade

*Confidential — for partner discussion only*

---

## Content at scale is broken

- Brands need **3–5 posts/week per platform** to grow — that's 15–25 posts/week across IG, TikTok, RedNote
- Marketing teams spend **12–16 hours/month** just planning and writing
- Existing tools force you to bounce between **5+ apps**: scheduler, AI text, AI image, video editor, analytics
- None properly support **RedNote (小红书)** — the platform driving Chinese consumer purchase decisions

> 96% of marketing managers say AI saves 80% of content time — but only when AI is built into the workflow.

---

## The market is split — nobody owns the full stack

### Schedulers
Buffer · Later · Postiz · Mixpost
*Solved 2014's problem. Weak AI. No video repurposing.*

### Listeners
Hootsuite · Sprout · Talkwalker
*Enterprise-priced. Western platforms only. No native AI generation.*

### AI tools
OpusClip · Canva · Predis.ai
*Narrow point solutions. No scheduling. No publishing.*

**Inboudly is the only platform that does all three.**

---

## One platform. End-to-end.

| Creation | Intelligence |
|---|---|
| ✏️ Captions in EN + Chinese | 📊 Pre-publish virality score |
| 🎨 Image generation | 🧠 Per-platform algorithm coach |
| 🎬 Video repurposing | ✅ Multi-level approval workflow |
| 📅 Scheduled publishing | 💬 Unified comment inbox + AI replies |

Built on **Claude Sonnet 4.6**, **GPT Image 2.0**, **Whisper**, **FFmpeg**, and proprietary engagement-prediction models.

---

### Pillar 1
## AI captions that learn *your* voice

- **Claude Sonnet 4.6** — best-in-class for tone fidelity
- **Brand-voice training**: paste your past best posts → Inboudly learns your style and writes in it (RAG with vector embeddings)
- **Bilingual** — native Simplified Chinese for RedNote, English everywhere else
- **Per-platform optimisation** — caption length, hashtag count, hook style — all tuned per platform's algorithm

---

### Pillar 2
## AI images that match your brand

- **GPT Image 2.0** + FLUX.1 — production-quality images from a prompt
- **Brand-kit aware** — colours, fonts, logo automatically baked in
- **Multiple aspect ratios** in one click — IG portrait, TikTok 9:16, RedNote 1:1
- **No design skill required** — type what you want, get it

---

### Pillar 3 — flagship
## One upload → every platform

Drop in a YouTube video, podcast, or blog. Inboudly:

1. Transcribes it with Whisper
2. Asks Claude to pick the highest-virality clips per platform
3. FFmpeg cuts + reframes (9:16 / 1:1 / 16:9)
4. Burns in branded captions
5. Schedules them across all your platforms

*Research-grounded (arXiv 2512.11399 "Minimal Clips, Maximum Salience"). No other social media tool ships this natively.*

---

### Pillar 4
## Know how a post will perform — *before* publishing

- Real-time score (0–100) updates as you edit
- Predicted reach + engagement rate
- Backed by ensemble ML (XGBoost + LightGBM)
- Calibrated against your account's own history

> +40% engagement lift from pre-publish prediction (Deloitte)

---

### Pillar 5
## Per-platform algorithm coaching, live

| Platform | Signals optimised |
|---|---|
| Instagram | DM shares · saves · 3-sec hold rate · trending audio |
| TikTok | Quality-graded interactions · trending sounds · hook engineering |
| RedNote | CES scoring · keyword-in-first-8-chars · search intent matching |
| LinkedIn / YouTube | Dwell time · CTR · session duration |

> No competitor has this. Tools either schedule blindly or analyse *after* the post fails.

---

## The **RedNote** moat

- RedNote drives **60% of Chinese consumer purchase decisions** via search-first behaviour
- **No Western tool** properly supports it — Buffer, Hootsuite, Sprout, Later: zero
- Inboudly ships:
  - Native Simplified Chinese generation
  - CES scoring optimiser (Comments=4 · Shares=4 · Follows=8 weighted)
  - Title-keyword-in-first-8-chars enforcement
  - Search-intent caption structuring

**Whoever owns RedNote in the West owns China-market social tooling.**

---

## Built for agencies + teams

### Multi-level approval
- Writer → Manager → Client
- 4 modes: None / Optional / Required / Multi-level
- Posts auto-lock after approval

### Shareable client links
- Client reviews **without an account**
- Approve / Request changes / Reject in one click
- Full audit trail per post

---

## How we stack up

| Capability | Buffer | Hootsuite | Sprout | Later | Postiz | **Inboudly** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| RedNote support | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ |
| Native AI image gen | ✗ | ✗ | ✗ | ✗ | DALL-E | ✅ GPT Image 2.0 |
| Native AI video gen | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ Runway + Kling |
| Video repurpose engine | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ |
| Pre-publish virality score | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ |
| Per-platform algorithm coach | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ |
| Native Chinese content gen | ✗ | ✗ | ✗ | ✗ | ✗ | ✅ |
| Full white-label | ✗ | Enterprise | Enterprise | ✗ | Self-host | ✅ |

*Inboudly wins on 8 of 8 differentiating capabilities.*

---

## Pricing

| Plan | Price/mo | For |
|---|:---:|---|
| **STARTER** | $49 | Solo creator · 3 accounts · 100 posts/mo |
| **PRO** ⭐ | $149 | Small team · 10 accounts · full AI · repurpose |
| **AGENCY** | $399 | 15 users · 50 accounts · KOL · competitor · approvals |
| **WHITE-LABEL** | from $1,999 | Custom domain · full rebrand · multi-tenant |
| **ENTERPRISE** | Custom | SSO · dedicated infra · custom AI training · SLA |

---

## 10-year roadmap

| Year | Focus |
|---|---|
| **1 — shipped** | IG + TikTok + RedNote · AI text/image · composer · scheduler · approvals · repurpose v1 |
| 2 | Video gen · deep analytics · comment intent AI · FB + LinkedIn + YT · KOL · competitors · trend radar |
| 3 | White-label resale · mobile + desktop apps · autonomous AI agents · brand voice memory |
| 4 | Virtual Influencer Studio · voice + music generation |
| 5 | Live multi-cast + commerce integrations |
| 6–8 | Industry vertical packs · plugin marketplace |
| 9–10 | Inboudly's own AI-native social network · IPO / acquisition |

---

## Why now

- **Virtual influencer market**: $6.9B (2024) → **$37.8B (2030)**
- **Social-media AI tools**: 28% CAGR through 2030
- **96%** of marketing managers use AI daily

Three irreversible shifts:

- **AI agents replace dashboards** — users will deploy autonomous agents, not click buttons
- **Authenticity counter-trend** — winners balance AI scale with human feel
- **China-market dominance** — RedNote becomes critical, Western tools haven't adapted

---

## Engineered for scale

| Layer | Stack |
|---|---|
| Frontend | Next.js 15 + Tailwind + shadcn/ui · Vercel edge |
| Backend | NestJS modular monolith · BullMQ async · Railway/AWS Fargate |
| Data | PostgreSQL (Supabase, RLS multi-tenant) · Pinecone (3072-dim) · Cloudflare R2 |
| AI | Claude Sonnet 4.6 · GPT Image 2.0 · Whisper · FFmpeg |
| Security | Supabase Auth (MFA, SSO) · Row-level security · Full audit log |

---

<!-- _class: invert lead -->
## Ready for a live demo?

15-minute walk-through. Bring one of your past posts and we'll regenerate it on the platform.

📧 agilec.dev1@gmail.com
🌐 github.com/LimHuanYang/Inboudly

*© Inboudly 2026 — All rights reserved*
