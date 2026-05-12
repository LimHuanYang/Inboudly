# Deployment

Inboudly is deployed in two pieces:

- **Web (Next.js)** → **Vercel**
- **API + worker (NestJS)** → **Railway** (Docker)

External services:

- **Postgres** → Supabase (or Neon)
- **Redis** → Upstash
- **Object storage** → Cloudflare R2
- **Vector DB** → Pinecone

---

## 1. Provision external services

### Supabase
1. Create a project at https://supabase.com
2. Project Settings → Database → copy the connection strings:
   - `DATABASE_URL` = the **Pooled** connection (port 6543) with `?pgbouncer=true&connection_limit=1` appended
   - `DIRECT_URL` = the **Direct** connection (port 5432)
3. API page → copy `URL`, `anon key`, `service_role key`
4. Push schema:
   ```bash
   pnpm db:generate
   pnpm db:push
   ```

### Upstash Redis
1. Create a database at https://upstash.com/redis
2. Copy the `redis://…` URL → `REDIS_URL`

### Cloudflare R2
1. Create an R2 bucket called `inboudly-media`
2. Account ID: dashboard sidebar
3. Settings → API tokens → create a bucket-scoped key with read+write
4. Optional: attach a public custom domain (e.g. `media.inboudly.com`) and set CORS to allow your Vercel domain

### Pinecone
1. Create an index named `inboudly-brand-voices` with **3072 dimensions** and **cosine** metric
2. Copy the API key

---

## 2. Vercel — deploy `apps/web`

1. Import the GitHub repo in Vercel
2. Set **Root Directory** to `apps/web`
3. Vercel will auto-detect Next.js and use `vercel.json` for the build command
4. Environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   NEXT_PUBLIC_API_URL=https://api.inboudly.com   # your Railway URL
   NEXT_PUBLIC_APP_URL=https://app.inboudly.com
   ```
5. Add your custom domain in Project Settings → Domains

---

## 3. Railway — deploy `apps/api` + worker

1. New project → Deploy from GitHub → pick the Inboudly repo
2. Railway auto-reads `railway.json` (root) and uses `apps/api/Dockerfile`
3. Add a **Postgres-flavoured** environment variable group (we don't use Railway Postgres — Supabase is the source of truth)
4. Set environment variables (see `.env.example` for the full list):
   ```
   NODE_ENV=production
   DATABASE_URL=...
   DIRECT_URL=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   REDIS_URL=...
   ANTHROPIC_API_KEY=...
   OPENAI_API_KEY=...
   PINECONE_API_KEY=...
   PINECONE_INDEX=inboudly-brand-voices
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=inboudly-media
   R2_PUBLIC_URL=https://media.inboudly.com
   INSTAGRAM_APP_ID=...
   INSTAGRAM_APP_SECRET=...
   TIKTOK_CLIENT_KEY=...
   TIKTOK_CLIENT_SECRET=...
   REDNOTE_API_KEY=...
   NEXT_PUBLIC_APP_URL=https://app.inboudly.com
   NEXT_PUBLIC_API_URL=https://api.inboudly.com
   ```
5. Add a custom domain (e.g. `api.inboudly.com`) and update DNS

The Dockerfile installs `ffmpeg` and `yt-dlp` for the repurpose worker — no extra setup required on the host.

---

## 4. Platform OAuth redirect URIs

After your API has a public URL, register these redirect URIs with each platform:

- **Instagram (Meta Developer)**:
  `https://api.inboudly.com/api/v1/oauth/instagram/callback`
- **TikTok for Developers**:
  `https://api.inboudly.com/api/v1/oauth/tiktok/callback`
- **RedNote** (third-party provider): paste the API key on the manual connect screen

---

## 5. Smoke test in production

```bash
curl https://api.inboudly.com/api/v1     # API up
curl https://app.inboudly.com            # web up
```

1. Sign up at `https://app.inboudly.com/sign-up`
2. Settings → Connect Instagram (popup OAuth flow)
3. Composer → write a caption → see Virality Score update
4. Calendar → schedule a post → check Railway logs for the publish job firing at the right time
