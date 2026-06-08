'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Users, Sparkles, BarChart3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Overview {
  postsCount: number;
  publishedCount: number;
  scheduledCount: number;
  totalFollowers: number;
  accounts: Array<{
    id: string;
    platform: string;
    handle: string;
    followerCount: number | null;
    engagementRate: number | string | null;
    lastSyncedAt: string | null;
  }>;
}

interface TimeseriesPoint {
  date: string;
  likes: number;
  comments: number;
  impressions: number;
  videoViews: number;
}

interface PostMetric {
  publicationId: string;
  platform: string;
  caption: string;
  platformPostUrl: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  videoViews: number;
  capturedAt: string;
}

export default function AnalyticsPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;
  const qc = useQueryClient();

  // Detect prefers-reduced-motion for chart animation opt-out
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const overview = useQuery({
    queryKey: ['analytics-overview', workspaceId],
    queryFn: () => api.get<Overview>(`/analytics/overview?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const timeseries = useQuery({
    queryKey: ['analytics-timeseries', workspaceId],
    queryFn: () =>
      api.get<TimeseriesPoint[]>(`/analytics/timeseries?workspaceId=${workspaceId}&days=30`),
    enabled: !!workspaceId,
  });

  const posts = useQuery({
    queryKey: ['analytics-posts', workspaceId],
    queryFn: () => api.get<PostMetric[]>(`/analytics/posts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const refresh = useMutation({
    mutationFn: () => api.post(`/analytics/refresh?workspaceId=${workspaceId}`),
    onSuccess: () => {
      toast('Refreshing metrics — check back shortly');
      qc.invalidateQueries({ queryKey: ['analytics-posts', workspaceId] });
      qc.invalidateQueries({ queryKey: ['analytics-timeseries', workspaceId] });
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Failed to enqueue refresh');
    },
  });

  const noAnimation = prefersReducedMotion.current;

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Cross-platform performance overview.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || !workspaceId}
          aria-label="Refresh metrics"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          Refresh metrics
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Followers" value={overview.data?.totalFollowers?.toLocaleString() ?? '—'} icon={Users} />
        <Stat label="Published 30d" value={overview.data?.publishedCount ?? '—'} icon={Sparkles} />
        <Stat label="Scheduled" value={overview.data?.scheduledCount ?? '—'} icon={TrendingUp} />
        <Stat label="Drafts 30d" value={overview.data?.postsCount ?? '—'} icon={BarChart3} />
      </div>

      {/* By-platform account table */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">By platform</CardTitle>
          <CardDescription>Latest snapshot per connected account.</CardDescription>
        </CardHeader>
        <CardContent>
          {!overview.data?.accounts.length ? (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Account</th>
                  <th className="py-2">Platform</th>
                  <th className="py-2 text-right">Followers</th>
                  <th className="py-2 text-right">Engagement</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.accounts.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-3">{a.handle}</td>
                    <td className="py-3 text-xs uppercase text-muted-foreground">{a.platform}</td>
                    <td className="py-3 text-right">{a.followerCount?.toLocaleString() ?? '—'}</td>
                    <td className="py-3 text-right">
                      {a.engagementRate ? `${(Number(a.engagementRate) * 100).toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Engagement-over-time line chart */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Engagement over time</CardTitle>
          <CardDescription>Last 30 days — likes, comments, and impressions.</CardDescription>
        </CardHeader>
        <CardContent>
          {timeseries.data && timeseries.data.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No metrics yet — publish posts, then hit Refresh
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={timeseries.data ?? []}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                aria-label="Engagement over time line chart"
                role="img"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  }
                />
                <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  labelFormatter={(v) => {
                    if (typeof v !== 'string') return String(v);
                    return new Date(v).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {/* Stroke colors chosen for ≥4.5:1 contrast on white/light backgrounds:
                    #2563eb blue (~5.9:1), #16a34a green (~5.1:1), #9333ea purple (~4.7:1) */}
                <Line
                  type="monotone"
                  dataKey="likes"
                  name="Likes"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!noAnimation}
                />
                <Line
                  type="monotone"
                  dataKey="comments"
                  name="Comments"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!noAnimation}
                />
                <Line
                  type="monotone"
                  dataKey="impressions"
                  name="Impressions"
                  stroke="#9333ea"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!noAnimation}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Per-post metrics table */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Per-post metrics</CardTitle>
          <CardDescription>Most recently captured metrics per published post.</CardDescription>
        </CardHeader>
        <CardContent>
          {posts.data && posts.data.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No metrics yet — publish posts, then hit Refresh
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Platform</th>
                    <th className="py-2 pr-4">Caption</th>
                    <th className="py-2 pr-4 text-right">Likes</th>
                    <th className="py-2 pr-4 text-right">Comments</th>
                    <th className="py-2 pr-4 text-right">Impressions</th>
                    <th className="py-2 pr-4 text-right">Views</th>
                    <th className="py-2 text-right">Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {(posts.data ?? []).map((p) => (
                    <tr key={p.publicationId} className="border-t">
                      <td className="py-3 pr-4 text-xs uppercase text-muted-foreground">
                        {p.platform}
                      </td>
                      <td className="max-w-[200px] py-3 pr-4">
                        {p.platformPostUrl ? (
                          <a
                            href={p.platformPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-primary underline-offset-4 hover:underline"
                            title={p.caption}
                          >
                            {p.caption
                              ? p.caption.slice(0, 60) + (p.caption.length > 60 ? '…' : '')
                              : '(no caption)'}
                          </a>
                        ) : (
                          <span className="block truncate" title={p.caption}>
                            {p.caption
                              ? p.caption.slice(0, 60) + (p.caption.length > 60 ? '…' : '')
                              : '(no caption)'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">{p.likes?.toLocaleString() ?? '—'}</td>
                      <td className="py-3 pr-4 text-right">{p.comments?.toLocaleString() ?? '—'}</td>
                      <td className="py-3 pr-4 text-right">{p.impressions?.toLocaleString() ?? '—'}</td>
                      <td className="py-3 pr-4 text-right">{p.videoViews?.toLocaleString() ?? '—'}</td>
                      <td className="py-3 text-right text-xs text-muted-foreground">
                        {p.capturedAt
                          ? new Date(p.capturedAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Deep per-post analytics, competitor benchmarking, and the Trend Radar land in Phase 2.
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 text-3xl font-bold">{value}</div>
          </div>
          <Icon className="h-8 w-8 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}
