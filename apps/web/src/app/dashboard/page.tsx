'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Send, Users, Sparkles } from 'lucide-react';

interface MeResponse {
  id: string;
  email: string;
  fullName?: string;
  memberships: Array<{
    role: string;
    workspace: { id: string; name: string; tenant: { name: string } };
  }>;
}

interface OverviewResponse {
  postsCount: number;
  publishedCount: number;
  scheduledCount: number;
  totalFollowers: number;
  accounts: Array<{
    id: string;
    platform: string;
    handle: string;
    followerCount: number | null;
    engagementRate: number | null;
  }>;
}

export default function DashboardOverview() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
  });

  const workspaceId = me.data?.memberships[0]?.workspace.id;

  const overview = useQuery({
    queryKey: ['overview', workspaceId],
    queryFn: () => api.get<OverviewResponse>(`/analytics/overview?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Welcome back{me.data?.fullName ? `, ${me.data.fullName.split(' ')[0]}` : ''}
        </h1>
        <p className="text-muted-foreground">
          {me.data?.memberships[0]?.workspace.name ?? 'Loading workspace…'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Send}
          label="Published (30d)"
          value={overview.data?.publishedCount ?? '—'}
        />
        <StatCard
          icon={Calendar}
          label="Scheduled"
          value={overview.data?.scheduledCount ?? '—'}
        />
        <StatCard
          icon={Sparkles}
          label="Drafts (30d)"
          value={overview.data?.postsCount ?? '—'}
        />
        <StatCard
          icon={Users}
          label="Followers (total)"
          value={overview.data?.totalFollowers?.toLocaleString() ?? '—'}
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>Your social channels in this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          {!overview.data?.accounts.length ? (
            <p className="text-sm text-muted-foreground">
              No accounts connected yet. Head to Settings → Social Accounts to connect Instagram,
              TikTok, or RedNote.
            </p>
          ) : (
            <ul className="divide-y">
              {overview.data.accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{a.handle}</div>
                    <div className="text-xs uppercase text-muted-foreground">{a.platform}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div>{a.followerCount?.toLocaleString() ?? '—'} followers</div>
                    <div className="text-xs text-muted-foreground">
                      {a.engagementRate ? `${(Number(a.engagementRate) * 100).toFixed(2)}% ER` : '—'}
                    </div>
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

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
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
