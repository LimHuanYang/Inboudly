'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, Sparkles, Users, TrendingUp, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Platform = 'INSTAGRAM' | 'TIKTOK' | 'REDNOTE' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE';

interface Snapshot {
  id: string;
  capturedAt: string;
  followerCount: number | null;
  postCount: number | null;
  engagementRate: number | string | null;
  topPostsJson: { top3?: string[] } | null;
}

interface CompetitorDetail {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string | null;
  notes: string | null;
  trackedSince: string;
  snapshots: Snapshot[];
}

interface GapAnalysisResult {
  ok: boolean;
  gaps: Array<{
    topic: string;
    competitorAdvantage: string;
    suggestedAngle: string;
    estimatedDifficulty: 'low' | 'medium' | 'high';
  }>;
  overallTakeaway: string;
  modelUsed?: string;
  message?: string;
}

interface AiCredentialsView {
  gemini: { configured: boolean };
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
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Minimal SVG line chart — no external charting lib needed. */
function Sparkline({
  values,
  width = 320,
  height = 80,
  color = 'currentColor',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) {
    return <div className="text-xs text-muted-foreground">Not enough data yet</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={i * stepX}
          cy={height - ((v - min) / range) * height}
          r={i === values.length - 1 ? 3 : 1.5}
          fill={color}
        />
      ))}
    </svg>
  );
}

export default function CompetitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  // Tells us which providers have keys configured — drives the selector
  // so users can't pick a provider they haven't set up.
  const creds = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () => api.get<AiCredentialsView>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });

  const detail = useQuery({
    queryKey: ['competitor', id, workspaceId],
    queryFn: () => api.get<CompetitorDetail>(`/competitors/${id}?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const analyze = useMutation({
    mutationFn: () =>
      api.post<GapAnalysisResult>(`/competitors/${id}/analyze-gap`, {
        workspaceId,
      }),
    onSuccess: (r) => {
      if (r.ok)
        toast.success(
          `Found ${r.gaps.length} content gap${r.gaps.length === 1 ? '' : 's'} (via ${r.modelUsed ?? 'AI'})`,
        );
      else toast.error(r.message ?? 'Analysis failed');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const geminiOk = !!creds.data?.gemini?.configured;
  const noProvider = !geminiOk;

  // Snapshots ordered oldest-first for charting
  const snapsAsc = useMemo(() => {
    if (!detail.data) return [];
    return [...detail.data.snapshots].reverse();
  }, [detail.data]);

  const followerValues = snapsAsc.map((s) => Number(s.followerCount ?? 0)).filter((v) => v > 0);
  const erValues = snapsAsc.map((s) => Number(s.engagementRate ?? 0)).filter((v) => v > 0);
  const latest = detail.data?.snapshots[0];

  if (detail.isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading competitor…</div>;
  }
  if (!detail.data) {
    return (
      <div className="container py-8 text-sm text-muted-foreground">
        Competitor not found.{' '}
        <Link href="/dashboard/competitors" className="text-primary hover:underline">
          Back
        </Link>
      </div>
    );
  }
  const c = detail.data;

  return (
    <div className="container max-w-5xl py-8">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/dashboard/competitors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to all competitors
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{c.displayName ?? c.handle}</CardTitle>
          <CardDescription className="font-mono">
            @{c.handle} · {PLATFORM_LABEL[c.platform]} · Tracked since{' '}
            {format(new Date(c.trackedSince), 'MMM d, yyyy')}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Headline stats */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-background p-4">
          <Users className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="text-2xl font-bold">{formatNumber(latest?.followerCount ?? null)}</div>
          <div className="text-xs text-muted-foreground">Followers</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <TrendingUp className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="text-2xl font-bold">
            {latest?.engagementRate ? `${(Number(latest.engagementRate) * 100).toFixed(2)}%` : '—'}
          </div>
          <div className="text-xs text-muted-foreground">Engagement rate</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <div className="mb-2 h-4 w-4" />
          <div className="text-2xl font-bold">{formatNumber(latest?.postCount ?? null)}</div>
          <div className="text-xs text-muted-foreground">Total posts</div>
        </div>
      </div>

      {/* Timeline */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Followers — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-primary">
            <Sparkline values={followerValues} width={680} height={120} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Engagement rate — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-amber-500">
            <Sparkline values={erValues} width={680} height={120} />
          </div>
        </CardContent>
      </Card>

      {/* Top posts from latest snapshot */}
      {latest?.topPostsJson?.top3?.length ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Their top performing posts (latest snapshot)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {latest.topPostsJson.top3.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {/* Content gap analysis */}
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" /> Content gap analysis
              </CardTitle>
              <CardDescription>
                Gemini compares their top posts to your recent posts, finds topics they win on but
                you don't cover, and suggests on-brand angles you could take.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border bg-background px-2 py-2 text-sm text-muted-foreground">
                Gemini
              </span>
              <Button
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending || noProvider}
              >
                {analyze.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing
                  </>
                ) : (
                  'Analyze gap'
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {noProvider && !analyze.isPending && (
            <p className="rounded bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              No AI provider configured for this workspace.{' '}
              <Link href="/dashboard/settings" className="font-medium underline">
                Add a Google API key in Settings
              </Link>
              .
            </p>
          )}
          {!noProvider && !analyze.data && !analyze.isPending && (
            <p className="text-sm text-muted-foreground">
              Click <strong>Analyze gap</strong> to run the analysis with Gemini.
            </p>
          )}
          {analyze.data && !analyze.data.ok && (
            <p className="rounded bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              {analyze.data.message}
            </p>
          )}
          {analyze.data?.ok && (
            <div className="space-y-3">
              {analyze.data.overallTakeaway && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <strong>Strategic takeaway:</strong> {analyze.data.overallTakeaway}
                </div>
              )}
              {analyze.data.gaps.map((g, i) => (
                <div key={i} className="rounded-lg border bg-background p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{g.topic}</h3>
                    <Badge
                      variant={
                        g.estimatedDifficulty === 'low'
                          ? 'success'
                          : g.estimatedDifficulty === 'medium'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {g.estimatedDifficulty} effort
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <strong className="text-foreground">Their advantage:</strong>{' '}
                    {g.competitorAdvantage}
                  </p>
                  <p className="mt-1 text-sm">
                    <strong>Your angle:</strong> {g.suggestedAngle}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
