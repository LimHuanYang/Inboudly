'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface SocialAccount {
  id: string;
  platform: string;
  handle: string;
  status: string;
  tokenExpiresAt: string | null;
}

const PLATFORM_OAUTH_PATH: Record<string, string> = {
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  REDNOTE: 'rednote',
};

export default function SettingsPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;
  const workspaceName = me.data?.memberships?.[0]?.workspace?.name;

  const accounts = useQuery({
    queryKey: ['social-accounts', workspaceId],
    queryFn: () => api.get<SocialAccount[]>(`/social-accounts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const startConnect = (platform: string) => {
    if (!workspaceId) return;
    const slug = PLATFORM_OAUTH_PATH[platform];
    if (!slug) return;
    window.open(
      `${API_URL}/api/v1/oauth/${slug}/start?workspaceId=${workspaceId}`,
      'inboudly_oauth',
      'width=600,height=700',
    );
  };

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">{workspaceName ?? 'Workspace'}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected accounts</CardTitle>
          <CardDescription>OAuth into the platforms you publish to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.data?.length ? (
            <ul className="divide-y">
              {accounts.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{a.handle}</div>
                    <div className="text-xs uppercase text-muted-foreground">{a.platform}</div>
                  </div>
                  <Badge variant={a.status === 'ACTIVE' ? 'success' : 'warning'}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {(['INSTAGRAM', 'TIKTOK', 'REDNOTE'] as const).map((p) => (
              <Button key={p} variant="outline" onClick={() => startConnect(p)}>
                <Plus className="mr-2 h-4 w-4" /> Connect {p}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Brand kit</CardTitle>
          <CardDescription>Colours, fonts, and logo used by AI generation.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brand kit editor lands later this week. Default kit is already created for your workspace.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Brand voice</CardTitle>
          <CardDescription>
            Train the AI on your past posts so generated content sounds like you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Paste 5–20 of your best posts in the voice training screen (coming next). Stored as
            embeddings in Pinecone — used as in-context examples by the Composer.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="flex justify-between border-b py-2">
            <span className="text-muted-foreground">Email</span>
            <span>{me.data?.email}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Plan</span>
            <span>{me.data?.memberships?.[0]?.workspace?.tenant?.plan ?? '—'}</span>
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild>
              <Link href="/sign-in">Sign out</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
