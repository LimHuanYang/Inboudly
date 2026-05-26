'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Radar, RefreshCw, Sparkles, X, Flame, TrendingUp, Activity, TrendingDown, Hash,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Platform = 'INSTAGRAM' | 'TIKTOK' | 'REDNOTE' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE';
type Velocity = 'BREAKOUT' | 'RISING' | 'SUSTAINED' | 'DECLINING';

interface Trend {
  id: string;
  platform: Platform;
  topic: string;
  category: string;
  description: string;
  velocity: Velocity;
  freshnessScore: number;
  estimatedReach: number | null;
  suggestedAngles: string[];
  hashtags: string[];
  exampleHandles: string[];
  detectedAt: string;
  expiresAt: string;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  REDNOTE: '小红书 RedNote',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
};

const VELOCITY_META: Record<Velocity, { label: string; icon: any; className: string }> = {
  BREAKOUT:  { label: 'Breakout',  icon: Flame,         className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  RISING:    { label: 'Rising',    icon: TrendingUp,    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  SUSTAINED: { label: 'Sustained', icon: Activity,      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  DECLINING: { label: 'Declining', icon: TrendingDown,  className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

// Suggestion chips — clicking sets the filter. Not exhaustive; users can
// type any category they want (backend does case-insensitive contains match).
const SUGGESTED_CATEGORIES = [
  'fitness', 'lifestyle', 'tech', 'beauty', 'food', 'finance',
  'education', 'fashion', 'travel', 'business', 'wellness', 'gaming',
  'parenting', 'pets', 'home', 'automotive', 'crypto', 'sustainability',
];

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TrendsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [platformFilter, setPlatformFilter] = useState<Platform | 'ALL'>('ALL');
  // categoryInput = what's currently in the box (changes on every keystroke).
  // categoryFilter = debounced 300ms — the value actually sent to the API.
  const [categoryInput, setCategoryInput] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setCategoryFilter(categoryInput.trim()), 300);
    return () => clearTimeout(t);
  }, [categoryInput]);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const trends = useQuery({
    queryKey: ['trends', workspaceId, platformFilter, categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId });
      if (platformFilter !== 'ALL') params.set('platform', platformFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      return api.get<Trend[]>(`/trends?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  const refreshAll = useMutation({
    mutationFn: () => api.post<{ ok: boolean; results: Array<{ platform: Platform; created: number }> }>(
      '/trends/refresh-all', { workspaceId },
    ),
    onSuccess: (r) => {
      const total = r.results.reduce((sum, x) => sum + x.created, 0);
      if (total > 0) {
        toast.success(`Generated ${total} new trends across ${r.results.filter((x) => x.created > 0).length} platforms`);
        qc.invalidateQueries({ queryKey: ['trends', workspaceId] });
      } else {
        toast.error('No trends generated. Check Settings → AI Providers.');
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const generateOne = useMutation({
    mutationFn: (platform: Platform) =>
      api.post<{ ok: boolean; created: number; message?: string }>(
        '/trends/generate', { workspaceId, platform, count: 8 },
      ),
    onSuccess: (r, platform) => {
      if (r.ok) {
        toast.success(`Generated ${r.created} ${platform} trends`);
        qc.invalidateQueries({ queryKey: ['trends', workspaceId] });
      } else {
        toast.error(r.message ?? 'Generation failed');
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => api.patch(`/trends/${id}/dismiss`, { workspaceId }),
    onSuccess: () => {
      toast.success('Dismissed');
      qc.invalidateQueries({ queryKey: ['trends', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const useInComposer = (trend: Trend) => {
    // Pass trend id; Composer fetches /trends/:id/composer-prompt to prefill
    router.push(`/dashboard/composer?trendId=${trend.id}`);
  };

  const items = trends.data ?? [];

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Radar className="h-7 w-7 text-primary" />
            Trend Radar
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-discovered trending topics per platform. Click a trend to send it
            straight into the Composer with prefilled prompt + hashtags.
          </p>
        </div>
        <Badge variant="info" className="text-xs shrink-0">Phase 2A.3 · Beta</Badge>
      </div>

      {/* Action row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => refreshAll.mutate()}
          disabled={refreshAll.isPending || !workspaceId}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshAll.isPending ? 'animate-spin' : ''}`} />
          {refreshAll.isPending ? 'Generating across all platforms…' : 'Refresh all trends'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Uses your BYOK text AI · trends auto-expire in 7 days
        </span>
      </div>

      {/* Platform filter chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Platform:</span>
        {(['ALL', 'INSTAGRAM', 'TIKTOK', 'REDNOTE', 'YOUTUBE', 'LINKEDIN', 'FACEBOOK'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPlatformFilter(p)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              platformFilter === p
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
            }`}
          >
            {p === 'ALL' ? 'All' : PLATFORM_LABEL[p]}
          </button>
        ))}
      </div>

      {/* Category filter — free-text with debounced backend match. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Category:</span>
        <div className="relative">
          <input
            type="text"
            value={categoryInput}
            onChange={(e) => setCategoryInput(e.target.value)}
            placeholder="Type any category (e.g. fitness, finance, crypto…)"
            className="w-72 rounded-md border bg-background px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {categoryInput && (
            <button
              onClick={() => setCategoryInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear filter"
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {categoryFilter && (
          <span className="text-xs text-muted-foreground">
            {items.length} match{items.length === 1 ? '' : 'es'}
          </span>
        )}
        {platformFilter !== 'ALL' && items.length === 0 && !trends.isLoading && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => generateOne.mutate(platformFilter)}
            disabled={generateOne.isPending}
            className="ml-auto"
          >
            {generateOne.isPending ? 'Generating…' : `Generate ${PLATFORM_LABEL[platformFilter]} trends`}
          </Button>
        )}
      </div>

      {/* Suggestion chips — click to apply. Helpful starter list; not exhaustive. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Try:</span>
        {SUGGESTED_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategoryInput(c)}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
              categoryFilter.toLowerCase() === c
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {trends.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading trends…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Radar className="mx-auto mb-3 h-10 w-10 opacity-30" />
            No trends yet{platformFilter !== 'ALL' && ` for ${PLATFORM_LABEL[platformFilter]}`}
            {categoryFilter && ` matching "${categoryFilter}"`}.
            <br />
            Click <strong>Refresh all trends</strong> above to generate the first batch.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => {
            const velocityMeta = VELOCITY_META[t.velocity];
            const VIcon = velocityMeta.icon;
            return (
              <Card key={t.id} className="flex h-full flex-col transition-shadow hover:shadow-md">
                <CardContent className="flex flex-1 flex-col gap-3 pt-6">
                  {/* Header: platform + velocity + dismiss */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px]">
                        {PLATFORM_LABEL[t.platform]}
                      </Badge>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${velocityMeta.className}`}
                      >
                        <VIcon className="h-3 w-3" />
                        {velocityMeta.label}
                      </span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {t.category}
                      </Badge>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Dismiss "${t.topic}"?`)) dismiss.mutate(t.id);
                      }}
                      className="shrink-0 text-muted-foreground transition hover:text-foreground"
                      title="Dismiss this trend"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Topic + description */}
                  <div>
                    <h3 className="font-semibold leading-tight">{t.topic}</h3>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {t.description}
                    </p>
                  </div>

                  {/* Hashtags */}
                  {t.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.hashtags.slice(0, 6).map((h) => (
                        <span
                          key={h}
                          className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          <Hash className="mr-0.5 h-2.5 w-2.5" />
                          {h}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Reach + freshness */}
                  <div className="mt-auto space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Est. reach: <strong className="text-foreground">{formatNumber(t.estimatedReach)}</strong></span>
                      <span>{t.freshnessScore}/100 fresh</span>
                    </div>
                    {/* Freshness bar */}
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          t.freshnessScore >= 80 ? 'bg-emerald-500'
                            : t.freshnessScore >= 50 ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${t.freshnessScore}%` }}
                      />
                    </div>
                  </div>

                  {/* CTA */}
                  <Button
                    size="sm"
                    onClick={() => useInComposer(t)}
                    className="w-full"
                  >
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    Use in Composer
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
