'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, TrendingUp, TrendingDown, RefreshCw, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Platform = 'INSTAGRAM' | 'TIKTOK' | 'REDNOTE' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE';

interface Snapshot {
  id: string;
  capturedAt: string;
  followerCount: number | null;
  engagementRate: number | string | null;
  postCount: number | null;
}

interface Competitor {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  trackedSince: string;
  notes: string | null;
  snapshots: Snapshot[];
}

const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  REDNOTE: '小红书 RedNote',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
};

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pct(n: number | string | null): string {
  if (n === null) return '—';
  return `${(Number(n) * 100).toFixed(2)}%`;
}

// Trend (latest vs. 7 days ago if available)
function trend(snapshots: Snapshot[], field: 'followerCount' | 'engagementRate') {
  if (snapshots.length < 2) return null;
  const latest = Number(snapshots[0]![field] ?? 0);
  const prior = Number(snapshots[snapshots.length - 1]![field] ?? 0);
  if (!prior) return null;
  const delta = (latest - prior) / prior;
  return delta;
}

export default function CompetitorsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newPlatform, setNewPlatform] = useState<Platform>('REDNOTE');
  const [newHandle, setNewHandle] = useState('');
  const [newName, setNewName] = useState('');

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const competitors = useQuery({
    queryKey: ['competitors', workspaceId],
    queryFn: () => api.get<Competitor[]>(`/competitors?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const add = useMutation({
    mutationFn: () =>
      api.post<Competitor>('/competitors', {
        workspaceId,
        platform: newPlatform,
        handle: newHandle,
        displayName: newName || undefined,
      }),
    onSuccess: () => {
      toast.success(`Added ${newPlatform} @${newHandle.replace(/^@/, '')}`);
      qc.invalidateQueries({ queryKey: ['competitors', workspaceId] });
      setNewHandle('');
      setNewName('');
      setShowAdd(false);
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to add'),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/competitors/${id}?workspaceId=${workspaceId}`),
    onSuccess: () => {
      toast.success('Removed');
      qc.invalidateQueries({ queryKey: ['competitors', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const refreshAll = useMutation({
    mutationFn: () => api.post('/competitors/snapshot-all', { workspaceId }),
    onSuccess: (r: any) => {
      toast.success(`Captured snapshots: ${r.captured}/${r.total}`);
      qc.invalidateQueries({ queryKey: ['competitors', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const items = competitors.data ?? [];

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Competitor Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Track up to 20 competitor accounts. Daily snapshots of followers, engagement, and top
            posts. AI content-gap analysis surfaces topics they win on that you don't cover.
          </p>
        </div>
        <Badge variant="info" className="text-xs">Phase 2A.2 · Beta</Badge>
      </div>

      <div className="mb-4 flex justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshAll.mutate()}
          disabled={refreshAll.isPending || items.length === 0}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshAll.isPending ? 'animate-spin' : ''}`} />
          Refresh all snapshots
        </Button>
        <Button onClick={() => setShowAdd((s) => !s)} disabled={items.length >= 20}>
          <Plus className="mr-2 h-4 w-4" />
          {items.length >= 20 ? 'Limit reached (20)' : 'Add competitor'}
        </Button>
      </div>

      {showAdd && (
        <Card className="mb-4">
          <CardContent className="space-y-3 pt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium">Platform</label>
                <select
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value as Platform)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {(['REDNOTE', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'FACEBOOK'] as Platform[]).map(
                    (p) => (
                      <option key={p} value={p}>
                        {PLATFORM_LABEL[p]}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Handle (without @)</label>
                <input
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value)}
                  placeholder="competitorname"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Display name (optional)</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Brand Name"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={!newHandle.trim() || add.isPending} onClick={() => add.mutate()}>
                {add.isPending ? 'Adding…' : 'Add competitor'}
              </Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              30 days of historical snapshots are auto-generated so you can see trends immediately.
              Real scrapers land next sprint.
            </p>
          </CardContent>
        </Card>
      )}

      {competitors.isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading competitors…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No competitors tracked yet. Add up to 20 to start benchmarking and content-gap analysis.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            const latest = c.snapshots[0];
            const followerTrend = trend(c.snapshots, 'followerCount');
            return (
              <Card key={c.id} className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 overflow-hidden">
                      <CardTitle className="truncate text-base">
                        {c.displayName ?? c.handle}
                      </CardTitle>
                      <CardDescription className="truncate font-mono">
                        @{c.handle} · {PLATFORM_LABEL[c.platform]}
                      </CardDescription>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm(`Stop tracking @${c.handle}?`)) remove.mutate(c.id);
                      }}
                      className="h-7 w-7 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <Link href={`/dashboard/competitors/${c.id}`}>
                  <CardContent className="cursor-pointer space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <strong>{formatNumber(latest?.followerCount ?? null)}</strong>
                        <span className="text-muted-foreground">followers</span>
                      </div>
                      {followerTrend !== null && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-xs ${
                            followerTrend >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {followerTrend >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {(followerTrend * 100).toFixed(1)}% / 30d
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Engagement</span>
                      <strong>{pct(latest?.engagementRate ?? null)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Posts</span>
                      <strong>{formatNumber(latest?.postCount ?? null)}</strong>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.snapshots.length} snapshot{c.snapshots.length === 1 ? '' : 's'} · click for
                      timeline + gap analysis
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
