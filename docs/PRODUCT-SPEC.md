# Inboudly — Product Specification

> AI-native social media intelligence platform built to lead the market for the next 10 years.

---

## Vision

The market is split into three buckets today:

- **Schedulers** — Buffer, Later, Mixpost, Postiz. Solved 2014's problem.
- **Listeners** — Hootsuite, Sprout Social, Talkwalker. Enterprise-priced, Western-only.
- **AI point-tools** — OpusClip, Predis.ai, Canva Magic. Narrow, single-feature.

**Nobody owns the full stack.** Inboudly does: AI creation + per-platform intelligence + scheduling + comment AI + KOL discovery + RedNote + agency white-label + future AI agents.

By 2030 the market goes through three shifts, and Inboudly is built for all of them:

1. **AI agents replace dashboards** — users deploy autonomous agents, not click buttons
2. **Virtual influencers explode** — projected to reach $37.8B by 2030
3. **Authenticity counter-trend** — winners balance AI scale with human feel

---

## Phase 1 MVP — 4-Week Build

Locked decisions:

| Decision | Choice |
|---|---|
| Phase 1 platforms | Instagram, TikTok, RedNote |
| Repurpose engine | Phase 1 — file + YouTube + podcast + blog URL |
| Approval workflow | Phase 1 — multi-level, shareable client links |
| Competitor tracking / KOL discovery | Phase 2 |
| Mobile + desktop apps | Phase 3 |
| Stack | Next.js 15 + NestJS + Supabase + Claude Sonnet 4.6 + Cloudflare R2 + Pinecone |

### Week-by-week

**Week 1 — Foundation**
- Monorepo (Turborepo + pnpm) ✅
- Prisma schema with multi-tenant RLS-ready models ✅
- Supabase Auth integration ✅
- Workspace + member roles + brand kit + brand voice ✅

**Week 2 — Composer + AI**
- Multi-platform composer with live preview ✅
- Claude Sonnet 4.6 text generation (bilingual EN + ZH) ✅
- GPT Image 2.0 image generation ✅
- Brand voice prompt embedding

**Week 3 — Repurpose Engine + Publishing**
- Repurpose ingestion + BullMQ jobs ✅ (scaffold)
- Whisper transcription pipeline
- LLM clip selection (Minimal Clips, Maximum Salience approach)
- FFmpeg reframe + caption burn-in
- Instagram Graph API connector
- TikTok Content Posting API connector
- RedNote unofficial API (via MCP)

**Week 4 — Intelligence + Workflow + Polish**
- Pre-publish Virality Score ✅
- Per-platform Algorithm Coach ✅
- Multi-level Approval Workflow ✅
- Comment inbox v0 ✅
- Basic analytics dashboard ✅

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
| `auth` | Provisioning, JWT validation via Supabase | 1 |
| `tenants` | Tenant CRUD, branding | 1 |
| `workspaces` | Workspace CRUD, member management, RBAC | 1 |
| `social-accounts` | OAuth connect, token refresh | 1 |
| `brand` | Brand kits + brand voices | 1 |
| `media` | R2 upload presigning, media registry | 1 |
| `posts` | Drafts, variants, scheduling | 1 |
| `scheduler` | BullMQ publish queue + processor | 1 |
| `approvals` | Multi-level workflow + shareable links | 1 |
| `comments` | Unified inbox, AI replies | 1 (v0) → 2 (intent AI) |
| `analytics` | Snapshots + overview | 1 (v0) → 2 (deep) |
| `ai` | Claude text + GPT image | 1 |
| `repurpose` | File/URL → multi-platform clips | 1 |
| `intelligence` | Virality score + algorithm coach | 1 |
| `kol` | KOL discovery + campaigns | 2 |
| `competitors` | Competitor tracking + benchmarking | 2 |
| `trends` | LSTM+GNN trend radar | 2 |
| `agents` | Autonomous AI agent runtime | 3 |

---

## Research-Backed Differentiators

Every major feature is grounded in academic research:

| Feature | Research |
|---|---|
| Virality Score | arXiv 2508.21650 — emotional + temporal features predict engagement |
| Algorithm Coach (Instagram) | Mosseri 2025 ranking signals |
| Algorithm Coach (TikTok) | SAGE 2025 — quality-graded interaction model |
| Algorithm Coach (RedNote) | CHI 2025 — CES scoring + search-first behavior (arXiv 2501.18210) |
| Repurpose Engine | arXiv 2512.11399 — Minimal Clips, Maximum Salience |
| Trend Radar (Phase 2) | LSTM + GNN — +9% accuracy uplift over LSTM alone |
| Comment Intent (Phase 2) | SentiNet (BiLSTM + CNN) state-of-the-art classifier |
| KOL Fraud Detection (Phase 2) | Forrester 2026 + 24/7 uniformity bot signal research |

---

## Competitive Position

| Feature | Buffer | Hootsuite | Sprout | Later | Postiz | **Inboudly** |
|---|---|---|---|---|---|---|
| RedNote support | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Native AI image gen | ❌ | ❌ | ❌ | ❌ | DALL-E | ✅ GPT Image 2.0 + FLUX |
| Native AI video gen | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Runway + Kling |
| Video repurpose engine | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Research-grade |
| Pre-publish virality score | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Per-platform algorithm coach | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Chinese content generation | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Full white-label | ❌ | Enterprise | Enterprise | ❌ | Self-host | ✅ |
| AI agents (autonomous) | ❌ | ❌ | ❌ | ❌ | Beta | ✅ Phase 3 |
| Virtual influencer studio | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Phase 3 |

**Inboudly wins on 10 of 10 differentiating capabilities.**

---

## 10-Year Roadmap

| Year | Focus |
|---|---|
| **1 (MVP)** | IG + TikTok + RedNote, AI text/image, composer, scheduler, approvals, repurpose v1, basic analytics |
| **2** | Video gen, deep analytics, comment intent AI, FB + LinkedIn + YT, KOL, competitor tracking, trend radar |
| **3** | White-label, mobile + desktop, AI agents (autonomous), brand voice memory |
| **4** | Virtual Influencer Studio, voice/music generation |
| **5** | Live multi-cast + commerce integrations |
| **6** | Industry vertical packs (beauty, fashion, fintech) |
| **7** | Inboudly App Marketplace (3rd-party plugins) |
| **8** | AI-native social network (meta-network owned by Inboudly) |
| **9** | Enterprise SSO, dedicated infra, custom AI training |
| **10** | IPO or strategic acquisition |

---

## Pricing

| Plan | Price | Target | Limits |
|---|---|---|---|
| **Starter** | $49/mo | Solo creator | 3 accounts, 1 user, 100 posts/mo |
| **Pro** | $149/mo | Small business | 10 accounts, 5 users, 500 posts/mo, full AI |
| **Agency** | $399/mo | Marketing agency | 50 accounts, 15 users, KOL + competitor + approvals |
| **White-Label** | from $1,999/mo | Resellers | Custom domain, full rebrand |
| **Enterprise** | Custom | 100+ accounts | SSO, dedicated infra, SLA |

### AI credit costs

- Text generation = 1 credit
- Image = 10 credits
- Video clip (5s) = 100 credits
- Voice (1 min) = 20 credits
- Repurpose (per clip) = 30 credits
