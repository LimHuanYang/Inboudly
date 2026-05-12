# Getting Started

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local Postgres + Redis, optional if using Supabase + Upstash directly)
- A Supabase project (free tier works)
- API keys: Anthropic, OpenAI, optionally Runway/ElevenLabs/Suno for Phase 2+

## 1. Install

```bash
pnpm install
```

## 2. Configure environment

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Fill in:
- `DATABASE_URL` + `DIRECT_URL` — from Supabase project settings
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — Supabase API page
- `ANTHROPIC_API_KEY` — console.anthropic.com
- `OPENAI_API_KEY` — platform.openai.com
- `REDIS_URL` — Upstash, or `redis://localhost:6379` if running locally
- `R2_*` — Cloudflare R2 bucket credentials
- `PINECONE_API_KEY` — pinecone.io

## 3. Push the database schema

```bash
pnpm db:generate
pnpm db:push
pnpm --filter @inboudly/database db:seed   # optional — creates a demo workspace
```

## 4. Run

```bash
pnpm dev
```

This runs:
- Web on http://localhost:3000
- API on http://localhost:3001
- API docs (Swagger) on http://localhost:3001/api/docs

## 5. Sign up

Open http://localhost:3000 → "Get started" → create your workspace. The API auto-provisions:
- A Tenant
- A User
- A Workspace (with "Main Workspace" as default)
- A default Brand Kit
- A default Brand Voice
- An Owner membership

## What's running

| Service | URL | Source |
|---|---|---|
| Landing page | / | `apps/web/src/app/page.tsx` |
| Sign up | /sign-up | `apps/web/src/app/sign-up/page.tsx` |
| Dashboard | /dashboard | `apps/web/src/app/dashboard/page.tsx` |
| Composer | /dashboard/composer | `apps/web/src/app/dashboard/composer/page.tsx` |
| API | http://localhost:3001/api/v1 | `apps/api/src/main.ts` |

## Phase 1 checklist (where to find things)

- ✅ Multi-tenant DB schema — `packages/database/prisma/schema.prisma`
- ✅ Platform specs (IG/TikTok/RedNote constraints) — `packages/shared/src/platforms.ts`
- ✅ Claude text generation — `apps/api/src/modules/ai/claude-text.service.ts`
- ✅ GPT Image generation — `apps/api/src/modules/ai/openai-image.service.ts`
- ✅ Virality Score — `apps/api/src/modules/intelligence/virality-score.service.ts`
- ✅ Algorithm Coach — `apps/api/src/modules/intelligence/algorithm-coach.service.ts`
- ✅ Approval Workflow — `apps/api/src/modules/approvals/approvals.service.ts`
- ✅ Scheduler (BullMQ) — `apps/api/src/modules/scheduler/`
- ✅ Repurpose Engine (queue + endpoint) — `apps/api/src/modules/repurpose/`
- ⏳ Platform connectors (IG / TikTok / RedNote) — Week 3 of build plan
- ⏳ Repurpose worker (Whisper + FFmpeg + Claude clip selection) — Week 3 of build plan
