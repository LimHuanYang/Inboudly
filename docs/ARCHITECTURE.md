# Architecture

## System map

```
┌──────────────────────────────────────────────────────────────────┐
│       Web (Next.js)  •  Mobile (Phase 3)  •  Desktop (Phase 3)    │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS, JWT (Supabase)
                ┌────────────▼────────────┐
                │    NestJS API Gateway   │
                │   /api/v1/*             │
                └────────────┬────────────┘
                             │
        ┌────────────────────┼────────────────────────────────┐
        │                    │                                │
┌───────▼────────┐  ┌────────▼─────────┐  ┌──────────────────▼────────┐
│ Core Modules   │  │  AI Modules      │  │  Integration Modules       │
├────────────────┤  ├──────────────────┤  ├────────────────────────────┤
│ auth           │  │ ai (claude+gpt)  │  │ social-accounts            │
│ tenants        │  │ intelligence     │  │ instagram-connector        │
│ workspaces     │  │ repurpose        │  │ tiktok-connector           │
│ brand          │  │ comments (P2)    │  │ rednote-connector          │
│ media          │  │ trends (P2)      │  │ webhooks                   │
│ posts          │  │ agents (P3)      │  │                            │
│ scheduler      │  │                  │  │                            │
│ approvals      │  │                  │  │                            │
│ analytics      │  │                  │  │                            │
│ kol (P2)       │  │                  │  │                            │
│ competitors(P2)│  │                  │  │                            │
└────────┬───────┘  └────────┬─────────┘  └────────────┬───────────────┘
         │                   │                         │
         └─────────┬─────────┴────────────┬────────────┘
                   │                      │
        ┌──────────▼─────────┐  ┌─────────▼──────────┐
        │   Data Layer       │  │   Async Layer      │
        ├────────────────────┤  ├────────────────────┤
        │ PostgreSQL         │  │ BullMQ queues      │
        │  (Supabase + RLS)  │  │  - publish         │
        │ Pinecone (vectors) │  │  - repurpose       │
        │ R2 (media)         │  │  - analytics-pull  │
        │ Redis (cache)      │  │  - trend-scan      │
        └────────────────────┘  └────────────────────┘
```

## Multi-tenancy

- Every tenant has its own logical workspace tree
- Row-Level Security on Postgres enforces isolation at the database level
- API gates verify workspace membership before any cross-workspace operation
- White-label tenants get a custom domain + branding without code changes (Phase 3)

## Async work

BullMQ queues for:
- **`publish`** — fires at `scheduledFor` time → calls platform connector → writes back PublicationStatus
- **`repurpose`** — long-running video pipeline (Whisper → segment → LLM scoring → FFmpeg)
- **`analytics-pull`** — daily cron pulling metrics from each connected account
- **`trend-scan`** — hourly Trend Radar (Phase 2)

## AI stack

| Capability | Service | Module |
|---|---|---|
| Text | Claude Sonnet 4.6 (Anthropic) | `modules/ai/claude-text.service.ts` |
| Image | GPT Image 2.0 (OpenAI) | `modules/ai/openai-image.service.ts` |
| Video (Phase 2) | Runway Gen-3, Kling v2 | `modules/ai/video-gen.service.ts` |
| Voice (Phase 3) | ElevenLabs Turbo v3 | `modules/ai/voice-gen.service.ts` |
| Music (Phase 3) | Suno v4 | `modules/ai/music-gen.service.ts` |
| Transcription | Whisper Large v3 | `modules/repurpose/transcribe.ts` |
| Embeddings | text-embedding-3-large | `modules/brand/voice-embeddings.ts` |
| Virality scoring (V1) | Rule-based heuristic ensemble | `modules/intelligence/virality-score.service.ts` |
| Virality scoring (V2) | XGBoost ensemble trained on real engagement data | Phase 2 |
| Sentiment / Intent (V2) | SentiNet (BiLSTM + CNN) | Phase 2 |
| Trend detection (V2) | LSTM + Graph Neural Net | Phase 2 |

## Open-source foundations we learn from

| Repo | What we borrow |
|---|---|
| gitroomhq/postiz-app | Scheduling patterns (Apache 2.0) |
| inovector/mixpost | Multi-platform connector design |
| langchain-ai/social-media-agent | AI agent patterns (Phase 3) |
| subzeroid/instagrapi | Instagram private API (where Graph falls short) |
| davidteather/TikTok-Api | TikTok unofficial fallback |
| MilesCool/rednote-mcp | RedNote content search via MCP |

## Security

- Supabase Auth handles password hashing, MFA, OAuth providers, session refresh
- API verifies every request's Bearer token against Supabase before any work
- Platform OAuth tokens encrypted at rest (application-layer AES) — TODO Phase 2
- Audit log on every state-changing action
- Rate limiting via NestJS Throttler (120 req/min default)
