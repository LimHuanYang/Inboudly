'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldX, Users, TrendingUp, Globe, Languages } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface KolDetail {
  id: string;
  platform: 'INSTAGRAM' | 'TIKTOK' | 'REDNOTE' | 'YOUTUBE' | 'LINKEDIN';
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  niche: string[];
  language: string | null;
  country: string | null;
  followerCount: number | null;
  engagementRate: number | string | null;
  authenticityScore: number | null;
  bot24x7Score: number | string | null;
  commentLanguageScore: number | string | null;
  lastAnalyzedAt: string | null;
  campaignDeliverables: Array<{
    id: string;
    status: string;
    agreedFee: number | string | null;
    campaign: { id: string; name: string; status: string };
  }>;
}

function formatFollowers(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pct(n: number | string | null): string {
  if (n === null) return '—';
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function Score({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-secondary/30 p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

export default function KolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const kol = useQuery({
    queryKey: ['kol', id],
    queryFn: () => api.get<KolDetail>(`/kol/${id}`),
  });

  if (kol.isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading KOL…</div>;
  }
  if (kol.error || !kol.data) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            KOL not found.{' '}
            <Link href="/dashboard/kol" className="text-primary hover:underline">
              Back to discovery
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const k = kol.data;
  const auth = k.authenticityScore ?? 0;
  const authVariant = auth >= 75 ? 'success' : auth >= 50 ? 'warning' : 'danger';
  const authIcon = auth >= 75 ? ShieldCheck : auth >= 50 ? ShieldAlert : ShieldX;
  const AuthIcon = authIcon;

  return (
    <div className="container max-w-5xl py-8">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/dashboard/kol">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to discovery
        </Link>
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{k.displayName ?? k.handle}</CardTitle>
              <CardDescription className="mt-1 font-mono text-sm">
                {k.handle} · {k.platform}
              </CardDescription>
              {k.bio && <p className="mt-3 text-sm">{k.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-1">
                {k.niche.map((n) => (
                  <span
                    key={n}
                    className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
            <Badge variant={authVariant}>
              <AuthIcon className="mr-1 h-3 w-3 inline" />
              {auth} authenticity
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Key stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-background p-4">
          <Users className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="text-2xl font-bold">{formatFollowers(k.followerCount)}</div>
          <div className="text-xs text-muted-foreground">Followers</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <TrendingUp className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="text-2xl font-bold">{pct(k.engagementRate)}</div>
          <div className="text-xs text-muted-foreground">Engagement rate</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <Globe className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="text-2xl font-bold">{k.country ?? '—'}</div>
          <div className="text-xs text-muted-foreground">Country</div>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <Languages className="mb-2 h-4 w-4 text-muted-foreground" />
          <div className="text-2xl font-bold">{k.language ?? '—'}</div>
          <div className="text-xs text-muted-foreground">Primary language</div>
        </div>
      </div>

      {/* Authenticity breakdown — the differentiator */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Authenticity breakdown</CardTitle>
          <CardDescription>
            Two signals combine to flag bot-driven engagement before you spend on a campaign.
            {k.lastAnalyzedAt && (
              <span> Last analysed {new Date(k.lastAnalyzedAt).toLocaleString()}.</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Score
              label="24/7 posting uniformity (bot signal)"
              value={k.bot24x7Score === null ? '—' : (Number(k.bot24x7Score) * 100).toFixed(0)}
              hint="0 = bursty (human). 100 = perfectly uniform (likely bot scheduler)."
            />
            <Score
              label="Comment genericness (bot signal)"
              value={
                k.commentLanguageScore === null
                  ? '—'
                  : (Number(k.commentLanguageScore) * 100).toFixed(0)
              }
              hint="0 = specific/contextual. 100 = bland praise + emoji ('🔥🔥🔥')."
            />
          </div>
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              auth >= 75
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-200'
                : auth >= 50
                  ? 'border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200'
                  : 'border-red-500/30 bg-red-500/5 text-red-900 dark:text-red-200'
            }`}
          >
            <strong>
              {auth >= 75
                ? 'High authenticity'
                : auth >= 50
                  ? 'Mixed signals — investigate'
                  : 'Suspicious — likely heavy bot engagement'}
            </strong>
            <p className="mt-1 text-xs opacity-80">
              {auth >= 75
                ? 'Engagement looks real. Reasonable choice for paid collab.'
                : auth >= 50
                  ? 'Worth a manual audit — check recent comment threads yourself before booking.'
                  : 'Recommend NOT booking. ER + follower numbers may be inflated by bots.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Past collaborations */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Past collaborations with this workspace</CardTitle>
        </CardHeader>
        <CardContent>
          {k.campaignDeliverables.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No past collaborations. Add this KOL to a campaign to track deliverables, fees,
              and performance.
            </p>
          ) : (
            <ul className="divide-y">
              {k.campaignDeliverables.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{d.campaign.name}</span>
                  <div className="flex items-center gap-2">
                    {d.agreedFee && <span className="text-muted-foreground">${Number(d.agreedFee).toFixed(0)}</span>}
                    <Badge variant="secondary">{d.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
