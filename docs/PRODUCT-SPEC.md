# Inboudly — Product Specification

> AI-native content engine — turn one idea into months of faceless videos + posts, distributed across every platform, amplified by the right KOLs. Built to lead the market for the next 10 years.

---

## Vision (updated May 2026)

The market is split into four buckets today:

- **Schedulers** — Buffer, Later, Mixpost, Postiz. Solved 2014's problem.
- **Listeners** — Hootsuite, Sprout Social, Talkwalker. Enterprise-priced, Western-only.
- **AI point-tools** — OpusClip, Predis.ai, Canva Magic. Narrow, single-feature.
- **Faceless-video automation** — Syllaby, Pictory, InVideo. Powerful video creation but no scheduling, no KOL, no algorithm intelligence.

**Nobody owns the full stack.** Inboudly does: AI content creation (text + image + faceless video) + per-platform intelligence + scheduling + KOL discovery + RedNote + agency white-label + future AI agents.

By 2030 the market goes through three shifts, and Inboudly is built for all of them:

1. **AI agents replace dashboards** — users deploy autonomous agents, not click buttons
2. **Virtual influencers explode** — projected to reach $37.8B by 2030
3. **Authenticity counter-trend** — winners balance AI scale with human feel

---

## Phase 1 — MVP (shipped ✅)

Composer · Multi-platform scheduler · Approvals (multi-level + shareable links) · Repurpose engine (file/YouTube/podcast/blog) · Brand Voice (Pinecone RAG) · Pre-publish Virality Score · Per-Platform Algorithm Coach · BYOK AI providers (Anthropic + Gemini + OpenAI, encrypted at rest) · Settings · Public review · Vercel + Railway deploy.

**Platforms**: Instagram, TikTok, RedNote (官方 small红书).

---

## Phase 2 — Intelligence + Content Engine (in progress)

Split into 3 sub-phases for shippability.

### Phase 2A — Intelligence Layer (~10 working days)

| # | Module | Status | Why |
|---|---|---|---|
| 2A.1 | **KOL Discovery** | ✅ Shipped | RedNote moat. Authenticity scoring (24/7 uniformity + comment genericness). 23 seed KOLs across IG/TikTok/RN. |
| 2A.2 | **Competitor Tracking** | In progress | Up to 20 competitors/workspace. Daily snapshots of followers/ER/top posts. Content gap analysis via Claude. |
| 2A.3 | **Trend Radar** | Next | LSTM + GNN-inspired heuristic. Surfaces hashtags/sounds/topics climbing fast. Feeds the Faceless Video Generator with "what to make". |
| 2A.4 | **Niche Intelligence** *(new — Syllaby-inspired)* | Next | RPM calculator per niche + recommendations. Sticky for creators deciding what to make. |
| 2A.5 | **Comment Intent AI v2** | Next | Replace Phase 1 stub with real classifier (Purchase / Complaint / Question / Fan / Spam). |

### Phase 2B — Faceless Video Engine (the flagship, ~13 working days)

This is the **biggest single feature** Inboudly will ever ship. Stitches text+image+video+voice+captions into a one-click workflow.

| # | Module | Why |
|---|---|---|
| 2B.1 | **Faceless Video Generator** *(new — Syllaby-inspired)* | Text idea → Claude script → GPT Image scenes → Runway/Kling motion → ElevenLabs voiceover → FFmpeg stitch with burn-in captions. One-click flagship. |
| 2B.2 | **Bulk Content Workflow** *(new)* | "Topic + date range → 60 drafts auto-scheduled across platforms" |
| 2B.3 | **Thumbnail Generator** *(new)* | AI YouTube/Reels thumbnails with brand kit |
| 2B.4 | **URL-to-Video** *(new — extends Repurpose)* | Paste article → faceless video, not just text repurpose |
| 2B.5 | **Runway + Kling integration** | Real motion video for B-roll scenes |
| 2B.6 | **ElevenLabs voice integration** *(moved from Phase 3)* | Voiceover for Faceless Video Generator |

**The Faceless Video Generator flow:**

```
User types:  "Top 5 mistakes new investors make"
       │
       ├─► Claude:     60-second script (3-sec hook + 5 tips + CTA)
       ├─► GPT Image:  6 still scenes
       ├─► Runway:     2 animated B-roll clips
       ├─► ElevenLabs: voiceover in chosen voice
       └─► FFmpeg:     stitched MP4 with burn-in captions
       │
       ├─► Virality Score + Algorithm Coach review
       └─► Scheduler: auto-post Saturday 8 AM (TikTok + Reels + RedNote)
```

No other tool does this end-to-end with built-in scheduling + algorithm coaching + KOL amplification.

### Phase 2C — Platform Expansion (~10 working days)

| # | Module | Effort |
|---|---|---|
| 2C.1 | Facebook connector | 2d |
| 2C.2 | LinkedIn Marketing API connector | 2d |
| 2C.3 | YouTube Data API + Shorts publishing | 4d |
| 2C.4 | Pinterest connector | 2d |

---

## Phase 3 — Scale & Productize

| # | Module | Notes |
|---|---|---|
| 3.1 | White-label | Custom domain, full tenant rebrand |
| 3.2 | Mobile app (React Native + Expo) | Even more valuable now with FVG |
| 3.3 | Desktop app (Tauri) | Same |
| 3.4 | Autonomous AI Agents | "Post 3x/week on cooking" runs without human |
| 3.5 | Virtual Influencer Studio *(absorbs Character Consistency from Syllaby)* | Persistent AI persona across videos |
| 3.6 | Voice Cloning *(Real Clone from Syllaby)* | Customer uploads voice sample → use in FVG |
| 3.7 | AI Music Generation (Suno) | Royalty-free background music |
| 3.8 | Live multi-cast | Stream to multiple platforms simultaneously |

---

## Phase 4 — Marketplace & verticals

| # | Module | Notes |
|---|---|---|
| 4.1 | Inboudly App Marketplace | 3rd-party plugins (like Shopify Apps) |
| 4.2 | Industry Vertical Packs | Pre-built templates for finance / beauty / fitness / fintech |
| 4.3 | Inboudly's own AI-native social network | The endgame |

---

## Architecture

```
inboudly/
├── apps/
│   ├── web/       Next.js 15 (App Router) + Tailwind + shadcn
│   └── api/       NestJS modular monolith
├── packages/
│   ├── database/  Prisma schema + client
│   └── shared/    Types, Zod schemas, platform specs, constants
```

### API modules

| Module | Purpose | Phase |
|---|---|---|
| `auth` | Provisioning, JWT validation via Supabase | 1 ✅ |
| `tenants` / `workspaces` | Multi-tenant CRUD + RBAC | 1 ✅ |
| `social-accounts` | OAuth connect, token refresh | 1 ✅ |
| `brand` | Brand kits + brand voices + voice training | 1 ✅ |
| `media` | R2 upload presigning, media registry | 1 ✅ |
| `posts` | Drafts, variants, scheduling | 1 ✅ |
| `scheduler` | BullMQ publish queue + processor | 1 ✅ |
| `approvals` | Multi-level workflow + shareable links | 1 ✅ |
| `comments` | Unified inbox, AI replies | 1 (v0) → 2A.5 (intent AI) |
| `analytics` | Snapshots + overview | 1 (v0) → 2 (deep) |
| `ai` | Claude text + GPT image + Gemini fallbacks | 1 ✅ |
| `ai-credentials` | BYOK encrypted per-workspace AI keys | 1 ✅ |
| `repurpose` | File/URL → multi-platform clips | 1 ✅ |
| `intelligence` | Virality score + algorithm coach | 1 ✅ |
| `kol` | KOL discovery + authenticity scoring | 2A.1 ✅ |
| `competitors` | Competitor tracking + content gap analysis | 2A.2 next |
| `trends` | Trend Radar (heuristic v1 → LSTM+GNN v2) | 2A.3 |
| `niche-intelligence` | RPM calculator + niche recommender | 2A.4 |
| `faceless-video` | Text → AI script → visuals → voice → captions → MP4 | 2B.1 |
| `bulk` | "60 drafts auto-scheduled" workflow | 2B.2 |
| `agents` | Autonomous AI agent runtime | 3 |

---

## Research-Backed Differentiators

| Feature | Research |
|---|---|
| Virality Score | arXiv 2508.21650 — emotional + temporal features predict engagement |
| Algorithm Coach (IG) | Mosseri 2025 ranking signals |
| Algorithm Coach (TikTok) | SAGE 2025 — quality-graded interaction model |
| Algorithm Coach (RedNote) | CHI 2025 — CES scoring + search-first behavior (arXiv 2501.18210) |
| Repurpose Engine | arXiv 2512.11399 — Minimal Clips, Maximum Salience |
| Trend Radar | LSTM + GNN — +9% accuracy uplift over LSTM alone |
| Comment Intent | SentiNet (BiLSTM + CNN) state-of-the-art classifier |
| KOL Fraud Detection | Forrester 2026 + 24/7 uniformity bot signal research |

---

## Competitive Position (updated)

| Capability | Buffer | Hootsuite | Sprout | Syllaby | HypeAuditor | **Inboudly** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Scheduling | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| AI text gen | Basic | Basic | Basic | ❌ | ❌ | ✅ Claude+Gemini |
| AI image gen | ❌ | ❌ | ❌ | Basic | ❌ | ✅ GPT Image+FLUX |
| **AI faceless video** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ Phase 2B |
| Repurpose engine | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Pre-publish virality score | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Per-platform algorithm coach | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Native Chinese / RedNote | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **KOL discovery** | ❌ | ❌ | ❌ | ❌ | ✅ Enterprise | ✅ All plans |
| **Authenticity scoring** | ❌ | ❌ | ❌ | ❌ | ✅ Enterprise | ✅ All plans |
| Bulk scheduling | ❌ | Limited | Limited | ✅ | ❌ | ✅ Phase 2B |
| Thumbnail generator | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ Phase 2B |
| Trend discovery | ❌ | Add-on | Add-on | ✅ | ❌ | ✅ Phase 2A.3 |
| BYOK encrypted keys | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| White-label | Enterprise | Enterprise | Enterprise | ❌ | Enterprise | ✅ Phase 3 |

**After Phase 2B ships: Inboudly wins on 15 of 15 capabilities.** Closest competitor (Syllaby) does 4. HypeAuditor does 3.

---

## Updated Pricing

| Plan | Price | Target | Now includes |
|---|---|---|---|
| **Starter** | $49/mo | Solo creator | 3 accounts, 100 posts/mo, **10 AI videos/mo**, basic AI text |
| **Pro** ⭐ | $149/mo | Small team | 10 accounts, 500 posts/mo, **60 AI videos/mo**, KOL discovery, full AI text/image |
| **Agency** | $399/mo | Marketing agency | 50 accounts, **unlimited AI video**, full KOL + competitor + trends + approvals, Bulk Workflow |
| **White-Label** | from $1,999/mo | Resellers | Custom domain, full rebrand, bulk video API, child workspaces |
| **Enterprise** | Custom | 100+ accounts | SSO, dedicated infra, custom AI training, SLA |

### AI credit costs

| Use | Credits |
|---|---|
| Text generation | 1 |
| Image | 10 |
| Video clip (5s) | 100 |
| Voice (1 min) | 20 |
| Repurpose (per clip) | 30 |
| **Faceless Video (60s, full pipeline)** | **~300** |

Customers can stay on **BYOK** (pay providers directly, no Inboudly markup) OR buy **Inboudly credits** ("managed mode" — we negotiate volume rates and resell with a small margin).

---

## 10-Year Roadmap (high-level)

| Year | Focus |
|---|---|
| **1** | ✅ Phase 1 MVP (IG + TikTok + RedNote, composer, scheduler, BYOK, repurpose) |
| **2** | Phase 2A → 2B → 2C (intelligence, faceless video engine, FB+LinkedIn+YT) |
| **3** | Phase 3 (white-label, mobile + desktop, AI agents, virtual influencer studio) |
| **4** | Voice cloning, AI music, live multi-cast |
| **5** | Industry vertical packs (finance, beauty, fitness, fintech) |
| **6-7** | Inboudly App Marketplace (3rd-party plugins) |
| **8** | Inboudly's own AI-native social network |
| **9** | Enterprise SSO, dedicated infra, custom AI training |
| **10** | IPO or strategic acquisition |
