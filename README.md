# Inboudly

AI-native social media intelligence platform. Create, schedule, and optimize content across Instagram, TikTok, RedNote, and more — powered by Claude, GPT Image, and proprietary engagement prediction models.

## Stack

- **Web** — Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **API** — NestJS + TypeScript (modular monolith)
- **Database** — PostgreSQL via Supabase (Row-Level Security for multi-tenancy)
- **Auth** — Supabase Auth
- **Cache + Queues** — Redis (Upstash) + BullMQ
- **Vector DB** — Pinecone (brand voice memory)
- **Media Storage** — Cloudflare R2
- **AI** — Claude Sonnet 4.6 (text), GPT Image 2.0 + FLUX (images), Runway/Kling (video)
- **Monorepo** — Turborepo + pnpm workspaces

## Repository Layout

```
inboudly/
├── apps/
│   ├── web/              # Next.js 15 frontend
│   └── api/              # NestJS backend
├── packages/
│   ├── database/         # Prisma schema + client
│   ├── shared/           # Shared types, constants, utils
│   ├── ui/               # Shared React components
│   └── config/           # Shared ESLint, Prettier, TS configs
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- A Supabase project (free tier works)
- Anthropic API key
- OpenAI API key (for image generation)

### Setup

```bash
# Install dependencies
pnpm install

# Copy env template
cp .env.example .env

# Edit .env with your keys

# Generate Prisma client + push schema to Supabase
pnpm db:generate
pnpm db:push

# Run dev (starts web on :3000 and api on :3001)
pnpm dev
```

## Phase 1 MVP Scope (Month 1)

- [x] Monorepo scaffolding
- [ ] Multi-tenant workspace foundations
- [ ] Brand kit + brand voice training
- [ ] Multi-platform composer (IG, TikTok, RedNote)
- [ ] Claude text generation + GPT image generation
- [ ] Repurpose engine (file upload, YouTube URL, podcast URL, blog URL)
- [ ] Scheduler + calendar
- [ ] Pre-publish virality score + per-platform algorithm coach
- [ ] Multi-level approval workflow
- [ ] Comment inbox (basic with AI suggestions)
- [ ] Basic analytics

See `docs/PRODUCT-SPEC.md` for the full 10-year roadmap.

## License

Proprietary — © Inboudly
