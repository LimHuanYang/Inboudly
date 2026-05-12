'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Sparkles, BarChart3 } from 'lucide-react';

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

export default function AnalyticsPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const overview = useQuery({
    queryKey: ['analytics-overview', workspaceId],
    queryFn: () => api.get<Overview>(`/analytics/overview?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Cross-platform performance overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat label="Followers" value={overview.data?.totalFollowers?.toLocaleString() ?? '—'} icon={Users} />
        <Stat label="Published 30d" value={overview.data?.publishedCount ?? '—'} icon={Sparkles} />
        <Stat label="Scheduled" value={overview.data?.scheduledCount ?? '—'} icon={TrendingUp} />
        <Stat label="Drafts 30d" value={overview.data?.postsCount ?? '—'} icon={BarChart3} />
      </div>

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
