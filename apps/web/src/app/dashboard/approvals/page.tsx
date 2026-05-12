'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PostListItem {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  scheduledFor: string | null;
  variants: Array<{ id: string; platform: string; caption: string }>;
  approvalWorkflow?: {
    id: string;
    status: string;
    shareableToken?: string | null;
    steps: Array<{
      id: string;
      stepOrder: number;
      status: string;
      approverId?: string | null;
      approverEmail?: string | null;
      decidedAt?: string | null;
    }>;
  } | null;
}

export default function ApprovalsPage() {
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const posts = useQuery({
    queryKey: ['posts-pending', workspaceId],
    queryFn: () => api.get<PostListItem[]>(`/posts?workspaceId=${workspaceId}&status=PENDING_APPROVAL`),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const requestApproval = useMutation({
    mutationFn: (input: { postId: string; approverEmail: string }) =>
      api.post<any>('/approvals', {
        postId: input.postId,
        mode: 'REQUIRED',
        steps: [{ stepOrder: 0, approverEmail: input.approverEmail }],
        generateShareableLink: true,
      }),
    onSuccess: () => {
      toast.success('Approval request created');
      posts.refetch();
      setCreatingFor(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/review/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Review link copied');
  };

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Posts awaiting internal or external sign-off before publishing.
        </p>
      </div>

      {posts.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !posts.data?.length ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Nothing pending approval right now. Posts you mark as needing approval will land here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.data.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{p.title ?? 'Untitled post'}</CardTitle>
                    <CardDescription>
                      Created {format(new Date(p.createdAt), 'MMM d, h:mm a')} ·{' '}
                      {p.variants.map((v) => v.platform).join(', ')}
                      {p.scheduledFor && ` · scheduled ${format(new Date(p.scheduledFor), 'MMM d, h:mm a')}`}
                    </CardDescription>
                  </div>
                  <Badge variant="warning">Pending</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {p.variants[0]?.caption ?? '—'}
                </p>

                {p.approvalWorkflow ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Workflow
                    </div>
                    {p.approvalWorkflow.steps.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                        <span>
                          Step {s.stepOrder + 1}: {s.approverEmail ?? 'internal user'}
                        </span>
                        <Badge
                          variant={
                            s.status === 'APPROVED'
                              ? 'success'
                              : s.status === 'REJECTED' || s.status === 'CHANGES_REQUESTED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {s.status}
                        </Badge>
                      </div>
                    ))}
                    {p.approvalWorkflow.shareableToken && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyShareLink(p.approvalWorkflow!.shareableToken!)}
                        >
                          <Copy className="mr-2 h-3 w-3" /> Copy review link
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a
                            href={`/review/${p.approvalWorkflow.shareableToken}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-2 h-3 w-3" /> Open
                          </a>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : creatingFor === p.id ? (
                  <CreateWorkflowForm
                    onSubmit={(email) => requestApproval.mutate({ postId: p.id, approverEmail: email })}
                    onCancel={() => setCreatingFor(null)}
                    pending={requestApproval.isPending}
                  />
                ) : (
                  <div className="mt-4">
                    <Button onClick={() => setCreatingFor(p.id)}>Request approval</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateWorkflowForm({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (email: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email);
      }}
      className="mt-4 flex gap-2"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="client@example.com"
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" disabled={pending || !email}>
        {pending ? 'Creating…' : 'Send'}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
