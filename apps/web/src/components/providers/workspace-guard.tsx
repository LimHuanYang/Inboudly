'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface MeResponse {
  id: string;
  email: string;
  fullName?: string | null;
  memberships?: Array<{ workspace: { id: string; name: string } }>;
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
 */
export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState('My Workspace');

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    // Don't retry on 401 — the user's just not authed yet
    retry: false,
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

  // Loading state — short, only while /auth/me resolves
  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Auth error (most often 401 — token expired or invalid)
  if (me.isError || !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Session expired
            </CardTitle>
            <CardDescription>
              Please sign in again to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <a href="/sign-in">Sign in</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // The case that was biting you — auth fine, but no workspace exists
  if (!me.data.memberships?.length) {
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
            <p className="text-xs text-muted-foreground">
              Signed in as <strong>{me.data.email}</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All good — render the dashboard
  return <>{children}</>;
}
