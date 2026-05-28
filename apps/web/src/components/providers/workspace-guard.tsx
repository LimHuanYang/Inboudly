'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface MeResponse {
  // null when the Supabase user has no Prisma row yet
  id: string | null;
  supabaseUserId?: string;
  email: string;
  fullName?: string | null;
  memberships?: Array<{ workspace: { id: string; name: string } }>;
  needsProvisioning?: boolean;
}

/**
 * Renders the dashboard ONLY when the signed-in user has at least one
 * workspace membership. If they don't (typical case: account created
 * directly in Supabase admin without going through our /auth/provision),
 * show an inline "Create your workspace" form that calls provision and
 * refreshes the page.
 *
 * Without this guard, every component using `me.data?.memberships?.[0]?.workspace?.id`
 * silently gets `undefined`, and any POST that sends it back as workspaceId
 * fails with 403 ("Not a member of this workspace").
 *
 * State machine:
 *   isLoading           → spinner
 *   isError (401/500)   → "Session expired"  (auth actually failed)
 *   data === null       → "Create workspace" (auth ok, no Prisma User row yet)
 *   data.memberships=0  → "Create workspace" (User exists, no membership)
 *   otherwise           → children
 *
 * The data === null case is critical: /auth/me returns 200 with `null` body
 * when the Supabase user has no matching Prisma User row. Treating that as
 * an auth error (the bug we just fixed) shows "Session expired" right after
 * a successful sign-in.
 */
export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState('My Workspace');

  const me = useQuery({
    queryKey: ['me'],
    // The endpoint returns null when the Supabase user has no Prisma row yet.
    queryFn: () => api.get<MeResponse | null>('/auth/me'),
    // While the API is still booting (cold compile can take ~1 min), the fetch
    // fails with a NETWORK error. Auto-retry those so the dashboard loads itself
    // once the API is up — no manual refresh needed. NEVER retry auth errors
    // (401) — those are real and need a sign-in, not a wait.
    retry: (failureCount, error) => {
      const msg = (error as Error)?.message?.toLowerCase() ?? '';
      const isNetwork =
        msg.includes('failed to fetch') ||
        msg.includes('network') ||
        msg.includes('load failed') ||
        msg.includes('connection') ||
        msg.includes('fetch');
      return isNetwork && failureCount < 40; // ~40 × 2s ≈ 80s of cold-start tolerance
    },
    retryDelay: 2000,
  });

  const provision = useMutation({
    mutationFn: () => api.post<unknown>('/auth/provision', { workspaceName }),
    onSuccess: () => {
      toast.success('Workspace created — welcome!');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to create workspace'),
  });

  // Auto-default the workspace name to something sensible if we know the user
  useEffect(() => {
    if (me.data?.fullName) {
      setWorkspaceName(`${me.data.fullName.split(' ')[0]}'s Workspace`);
    } else if (me.data?.email) {
      setWorkspaceName(`${me.data.email.split('@')[0]}'s Workspace`);
    }
  }, [me.data?.fullName, me.data?.email]);

  // Loading state. On a normal load this is a brief spinner. But if the API
  // is still cold-booting, the query auto-retries — `failureCount > 0` tells
  // us we're waiting on the API, so show reassuring "starting up" copy instead
  // of a bare spinner. It loads itself the moment the API answers.
  if (me.isLoading) {
    const waitingOnApi = me.failureCount > 0;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {waitingOnApi ? (
          <div className="max-w-sm">
            <p className="text-sm font-medium">Starting the API…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              First boot compiles the server (can take ~1 min). This page loads
              automatically once it's ready — no need to refresh.
              <br />
              <span className="opacity-60">Attempt {me.failureCount}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    );
  }

  // Real error path. Distinguish three sub-cases so the UI doesn't
  // misleadingly say "Session expired" when in fact the API is down or
  // the user lost network — both common in local dev.
  if (me.isError) {
    const errMsg = (me.error as Error | null)?.message ?? '';
    const isNetworkError =
      errMsg.toLowerCase().includes('failed to fetch') ||
      errMsg.toLowerCase().includes('network') ||
      errMsg.toLowerCase().includes('connection');
    const isAuthError = errMsg.toLowerCase().includes('token') || errMsg.includes('401');

    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              {isNetworkError
                ? "Can't reach the API"
                : isAuthError
                  ? 'Session expired'
                  : 'Something went wrong'}
            </CardTitle>
            <CardDescription>
              {isNetworkError ? (
                <>
                  The API server at <code className="rounded bg-muted px-1 py-0.5 text-xs">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}</code>{' '}
                  isn't responding. Start it with{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">pnpm dev:api</code> in
                  your terminal, then click Retry.
                </>
              ) : isAuthError ? (
                'Please sign in again to continue.'
              ) : (
                errMsg || 'Failed to load your account.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            {isNetworkError ? (
              <Button className="w-full" onClick={() => me.refetch()}>
                Retry
              </Button>
            ) : (
              <Button asChild className="w-full">
                <a href="/sign-in">Sign in</a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Auth ok, but either:
  //   (a) no Prisma User row yet (data === null) — typical first sign-in for
  //       accounts created directly in Supabase admin, OR
  //   (b) User row exists but no membership (data && memberships empty).
  // Both cases need the same fix: call /auth/provision to create the
  // tenant + workspace + membership.
  if (!me.data || !me.data.memberships?.length) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>One last step — create your workspace</CardTitle>
            <CardDescription>
              Your sign-in worked, but you haven't set up a workspace yet. Name it now and we'll
              spin up your tenant, brand kit, and default brand voice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">Workspace name</label>
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Acme Inc."
              />
            </div>
            <Button
              className="w-full"
              disabled={!workspaceName.trim() || provision.isPending}
              onClick={() => provision.mutate()}
            >
              {provision.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create workspace'
              )}
            </Button>
            {me.data?.email && (
              <p className="text-xs text-muted-foreground">
                Signed in as <strong>{me.data.email}</strong>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // All good — render the dashboard
  return <>{children}</>;
}
