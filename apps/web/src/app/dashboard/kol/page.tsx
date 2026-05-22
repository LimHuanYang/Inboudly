'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ShieldX, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Platform = 'INSTAGRAM' | 'TIKTOK' | 'REDNOTE' | 'YOUTUBE' | 'LINKEDIN';

interface KolListItem {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  niche: string[];
  language: string | null;
  country: string | null;
  followerCount: number | null;
  engagementRate: number | string | null; // Prisma Decimal serialises as string
  authenticityScore: number | null;
}

interface SearchResponse {
  items: KolListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  REDNOTE: '小红书 RedNote',
  YOUTUBE: 'YouTube',
  LINKEDIN: 'LinkedIn',
};

const SORTS = [
  { id: 'followers',    label: 'Followers ↓' },
  { id: 'engagement',   label: 'Engagement ↓' },
  { id: 'authenticity', label: 'Authenticity ↓' },
  { id: 'recent',       label: 'Recently added' },
] as const;

function formatFollowers(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function AuthenticityBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="secondary">— authenticity</Badge>;
  if (score >= 75) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3 w-3" /> {score} authentic
      </span>
    );
  }
  if (score >= 50) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <ShieldAlert className="h-3 w-3" /> {score} mixed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
      <ShieldX className="h-3 w-3" /> {score} suspicious
    </span>
  );
}

export default function KolPage() {
  const [platform, setPlatform] = useState<Platform | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [minFollowers, setMinFollowers] = useState<string>('');
  const [minAuth, setMinAuth] = useState<string>('');
  const [sortBy, setSortBy] = useState<typeof SORTS[number]['id']>('followers');

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (platform !== 'ALL') p.set('platform', platform);
    if (q) p.set('q', q);
    if (minFollowers) p.set('minFollowers', minFollowers);
    if (minAuth) p.set('minAuthenticityScore', minAuth);
    p.set('sortBy', sortBy);
    p.set('limit', '24');
    return p.toString();
  }, [platform, q, minFollowers, minAuth, sortBy]);

  const search = useQuery({
    queryKey: ['kol-search', queryString],
    queryFn: () => api.get<SearchResponse>(`/kol?${queryString}`),
  });

  const total = search.data?.items.length ?? 0;

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">KOL Discovery</h1>
          <p className="text-sm text-muted-foreground">
            Find creators across RedNote, Instagram, and TikTok. Authenticity scoring catches bot
            engagement before you spend on a campaign.
          </p>
        </div>
        <Badge variant="info" className="text-xs">Phase 2 · Beta</Badge>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'REDNOTE', 'INSTAGRAM', 'TIKTOK'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  platform === p
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                }`}
              >
                {p === 'ALL' ? 'All platforms' : PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium">Search by handle, name, or bio</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. skincare, coffee, fitness, butcher…"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Min followers</label>
              <input
                type="number"
                value={minFollowers}
                onChange={(e) => setMinFollowers(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Min authenticity</label>
              <input
                type="number"
                min={0}
                max={100}
                value={minAuth}
                onChange={(e) => setMinAuth(e.target.value)}
                placeholder="75"
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="text-xs text-muted-foreground">
              {search.isLoading ? 'Searching…' : `${total} creators${search.data?.hasMore ? '+' : ''}`}
            </div>
            <div className="flex gap-1">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSortBy(s.id)}
                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                    sortBy === s.id ? 'border-primary bg-primary/5' : 'hover:bg-secondary'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {search.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Searching the KOL pool…
          </CardContent>
        </Card>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No KOLs match these filters. Try widening them.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {search.data!.items.map((k) => (
            <Link key={k.id} href={`/dashboard/kol/${k.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 overflow-hidden">
                      <CardTitle className="truncate text-base">
                        {k.displayName ?? k.handle}
                      </CardTitle>
                      <CardDescription className="truncate font-mono">
                        {k.handle} · {PLATFORM_LABEL[k.platform]}
                      </CardDescription>
                    </div>
                    <AuthenticityBadge score={k.authenticityScore} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {k.bio && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{k.bio}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <strong>{formatFollowers(k.followerCount)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      ER{' '}
                      <strong className="text-foreground">
                        {k.engagementRate ? `${(Number(k.engagementRate) * 100).toFixed(1)}%` : '—'}
                      </strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {k.niche.slice(0, 4).map((n) => (
                      <span
                        key={n}
                        className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
