'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { AiProvidersCard } from './ai-providers-card';
import { AiDefaultsCard } from './ai-defaults-card';
import { CurrencyCard } from './currency-card';

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
  YOUTUBE: 'youtube',
  FACEBOOK: 'facebook',
  LINKEDIN: 'linkedin',
  PINTEREST: 'pinterest',
};

export default function SettingsPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;
  const workspaceName = me.data?.memberships?.[0]?.workspace?.name;
  const workspaceCurrency = me.data?.memberships?.[0]?.workspace?.currency;

  const accounts = useQuery({
    queryKey: ['social-accounts', workspaceId],
    queryFn: () => api.get<SocialAccount[]>(`/social-accounts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const startConnect = async (platform: string) => {
    if (!workspaceId) return;
    const slug = PLATFORM_OAUTH_PATH[platform];
    if (!slug) return;
    // Open the popup synchronously (inside the click) so the browser doesn't
    // block it, then send it to the platform consent URL once we've fetched it.
    // We must fetch /start through the authed api client — it's behind the
    // Supabase guard, so a bare window.open (no Bearer header) gets a 401.
    const popup = window.open('about:blank', 'inboudly_oauth', 'width=600,height=700');
    try {
      const { url } = await api.get<{ url: string; state: string }>(
        `/oauth/${slug}/start?workspaceId=${workspaceId}`,
      );
      if (popup) popup.location.href = url;
      else window.location.href = url; // popup blocked → full-page redirect
    } catch (e) {
      popup?.close();
      toast.error(`Couldn't start ${platform} connection: ${(e as Error).message}`);
    }
  };

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">{workspaceName ?? 'Workspace'}</p>
      </div>

      {/* AI Providers — BYOK. Place above social accounts because users
          need keys before they can generate content in the composer. */}
      {workspaceId && (
        <div className="mb-4">
          <AiProvidersCard workspaceId={workspaceId} />
        </div>
      )}

      {/* AI defaults — pick provider + model per task (captions / images). */}
      {workspaceId && (
        <div className="mb-4">
          <AiDefaultsCard workspaceId={workspaceId} />
        </div>
      )}

      {/* Currency — workspace money display + AI RPM estimation currency. */}
      {workspaceId && (
        <div className="mb-4">
          <CurrencyCard workspaceId={workspaceId} currentCurrency={workspaceCurrency} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected accounts</CardTitle>
          <CardDescription>OAuth into the platforms you publish to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.data?.length ? (
            <ul className="divide-y">
              {accounts.data.map((a) =>
                a.status === 'PENDING_REAUTH' ? (
                  <li
                    key={a.id}
                    role="alert"
                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 dark:border-amber-700/60 dark:bg-amber-950/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle
                          className="h-4 w-4 flex-none text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                        <span>{a.handle}</span>
                        <span className="text-xs font-semibold uppercase text-amber-600 dark:text-amber-400">
                          Reconnect needed
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                        {a.platform} · Access expired — reconnect to keep publishing.
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="min-h-[40px] flex-none bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
                      aria-label={`Reconnect ${a.platform} account ${a.handle}`}
                      onClick={() => startConnect(a.platform)}
                    >
                      Reconnect
                    </Button>
                  </li>
                ) : (
                  <li key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="font-medium">{a.handle}</div>
                      <div className="text-xs uppercase text-muted-foreground">{a.platform}</div>
                    </div>
                    <Badge variant={a.status === 'ACTIVE' ? 'success' : 'warning'}>{a.status}</Badge>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No accounts connected yet.</p>
          )}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            {(['INSTAGRAM', 'TIKTOK', 'REDNOTE', 'YOUTUBE', 'FACEBOOK', 'LINKEDIN', 'PINTEREST'] as const).map((p) => (
              <Button key={p} variant="outline" aria-label={`Connect ${p}`} onClick={() => startConnect(p)}>
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
