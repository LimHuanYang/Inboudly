'use client';

import { use, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Check, X, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ReviewWorkflow {
  id: string;
  status: string;
  shareableExpiresAt?: string | null;
  steps: Array<{
    id: string;
    stepOrder: number;
    status: string;
    approverEmail: string | null;
    comment: string | null;
  }>;
  post: {
    id: string;
    title: string | null;
    scheduledFor: string | null;
    variants: Array<{
      id: string;
      platform: string;
      caption: string;
      hashtags: string[];
      media: Array<{
        id: string;
        order: number;
        mediaAsset: { id: string; type: string; url: string; thumbnailUrl: string | null };
      }>;
    }>;
  };
}

export default function PublicReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [comment, setComment] = useState('');

  const wf = useQuery({
    queryKey: ['review', token],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/approvals/shareable/${token}`);
      if (!res.ok) throw new Error('Invalid or expired review link');
      return res.json() as Promise<ReviewWorkflow>;
    },
  });

  const decide = useMutation({
    mutationFn: async (decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED') => {
      const pendingStep = wf.data?.steps.find((s) => s.status === 'PENDING');
      if (!pendingStep) throw new Error('No pending step to decide on');
      const res = await fetch(`${API_URL}/api/v1/approvals/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: wf.data!.id,
          stepId: pendingStep.id,
          decision,
          comment,
        }),
      });
      if (!res.ok) throw new Error('Decision failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Decision recorded');
      wf.refetch();
      setComment('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (wf.isLoading) {
    return <CenteredMessage>Loading review…</CenteredMessage>;
  }
  if (wf.error || !wf.data) {
    return <CenteredMessage>This review link is invalid or has expired.</CenteredMessage>;
  }

  const post = wf.data.post;
  const decided = wf.data.status !== 'PENDING';

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-7 w-7 rounded-md bg-primary" />
            <span>Inboudly review</span>
          </div>
          <Badge variant={decided ? 'success' : 'warning'}>{wf.data.status}</Badge>
        </div>
      </header>

      <main className="container max-w-4xl py-8">
        <h1 className="mb-2 text-3xl font-bold">{post.title ?? 'Review this post'}</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          {post.scheduledFor && (
            <>Scheduled for {format(new Date(post.scheduledFor), 'EEE, MMM d · h:mm a')} · </>
          )}
          {post.variants.length} platform variant{post.variants.length === 1 ? '' : 's'}
        </p>

        <div className="space-y-4">
          {post.variants.map((v) => (
            <Card key={v.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs uppercase">
                    {v.platform}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{v.caption}</p>
                {v.hashtags.length > 0 && (
                  <p className="mt-2 text-sm text-primary">
                    {v.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
                  </p>
                )}
                {v.media.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {v.media
                      .sort((a, b) => a.order - b.order)
                      .map((m) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={m.id}
                          src={m.mediaAsset.thumbnailUrl ?? m.mediaAsset.url}
                          alt=""
                          className="aspect-square w-full rounded-md border object-cover"
                        />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {!decided && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" /> Your decision
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional comment (especially if requesting changes)…"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => decide.mutate('APPROVED')} disabled={decide.isPending}>
                  <Check className="mr-2 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide.mutate('CHANGES_REQUESTED')}
                  disabled={decide.isPending}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Request changes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => decide.mutate('REJECTED')}
                  disabled={decide.isPending}
                >
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <Card className="max-w-md text-center">
        <CardContent className="pt-6 text-sm text-muted-foreground">{children}</CardContent>
      </Card>
    </div>
  );
}
