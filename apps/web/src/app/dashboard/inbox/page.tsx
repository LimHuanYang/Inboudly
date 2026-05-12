'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Sparkles, Send } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Intent = 'PURCHASE_INTENT' | 'COMPLAINT' | 'QUESTION' | 'FAN_ENGAGEMENT' | 'SPAM' | 'UNCLASSIFIED';
type ReplyStatus = 'PENDING' | 'REPLIED' | 'HIDDEN' | 'IGNORED';

interface Comment {
  id: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  body: string;
  language?: string;
  postedAt: string;
  intent: Intent;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' | 'UNANALYZED';
  replyStatus: ReplyStatus;
  socialAccount: { platform: string; handle: string };
  replies: Array<{ id: string; body: string; sentAt: string | null }>;
}

const INTENT_VARIANT: Record<Intent, 'default' | 'success' | 'warning' | 'danger' | 'info' | 'secondary'> = {
  PURCHASE_INTENT: 'success',
  COMPLAINT: 'danger',
  QUESTION: 'info',
  FAN_ENGAGEMENT: 'default',
  SPAM: 'secondary',
  UNCLASSIFIED: 'secondary',
};

const INTENT_LABEL: Record<Intent, string> = {
  PURCHASE_INTENT: 'Purchase intent',
  COMPLAINT: 'Complaint',
  QUESTION: 'Question',
  FAN_ENGAGEMENT: 'Fan',
  SPAM: 'Spam',
  UNCLASSIFIED: 'New',
};

export default function InboxPage() {
  const [intentFilter, setIntentFilter] = useState<Intent | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<ReplyStatus | 'ALL'>('PENDING');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const inbox = useQuery({
    queryKey: ['inbox', workspaceId, intentFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ workspaceId });
      if (intentFilter !== 'ALL') params.set('intent', intentFilter);
      if (statusFilter !== 'ALL') params.set('replyStatus', statusFilter);
      return api.get<Comment[]>(`/comments?${params.toString()}`);
    },
    enabled: !!workspaceId,
  });

  const active = inbox.data?.find((c) => c.id === activeId) ?? inbox.data?.[0];

  const suggest = useMutation({
    mutationFn: (commentId: string) =>
      api.post<{ suggestions: string[] }>(`/comments/${commentId}/suggest-replies`),
    onSuccess: (data) => {
      if (data.suggestions[0]) setReplyDraft(data.suggestions[0]);
      toast.success('AI generated reply suggestions');
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Unified comments + DMs across all your connected accounts.
        </p>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['ALL', 'UNCLASSIFIED', 'PURCHASE_INTENT', 'QUESTION', 'COMPLAINT', 'FAN_ENGAGEMENT', 'SPAM'] as const).map(
          (i) => (
            <button
              key={i}
              onClick={() => setIntentFilter(i)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                intentFilter === i ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary'
              }`}
            >
              {i === 'ALL' ? 'All intents' : INTENT_LABEL[i as Intent]}
            </button>
          ),
        )}
        <span className="mx-2 self-center text-xs text-muted-foreground">·</span>
        {(['PENDING', 'REPLIED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              statusFilter === s ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary'
            }`}
          >
            {s === 'ALL' ? 'All status' : s.toLowerCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* List column */}
        <Card className="col-span-12 md:col-span-5">
          <CardContent className="p-0">
            {inbox.isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : !inbox.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">
                No comments yet. They'll appear here as they come in across your connected accounts.
              </p>
            ) : (
              <ul className="divide-y">
                {inbox.data.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => {
                        setActiveId(c.id);
                        setReplyDraft('');
                      }}
                      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-secondary/40 ${
                        active?.id === c.id ? 'bg-secondary/60' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{c.authorHandle}</span>
                          <span className="text-xs uppercase text-muted-foreground">
                            {c.socialAccount.platform}
                          </span>
                        </div>
                        <Badge variant={INTENT_VARIANT[c.intent]} className="text-[10px]">
                          {INTENT_LABEL[c.intent]}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.body}</p>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {format(new Date(c.postedAt), 'MMM d, h:mm a')}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Detail column */}
        <Card className="col-span-12 md:col-span-7">
          <CardContent className="pt-6">
            {!active ? (
              <p className="text-sm text-muted-foreground">Select a comment to reply.</p>
            ) : (
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="font-medium">{active.authorHandle}</div>
                    <div className="text-xs text-muted-foreground">
                      {active.socialAccount.platform} · {active.socialAccount.handle} ·{' '}
                      {format(new Date(active.postedAt), 'MMM d, h:mm a')}
                    </div>
                  </div>
                  <Badge variant={INTENT_VARIANT[active.intent]}>{INTENT_LABEL[active.intent]}</Badge>
                </div>

                <div className="rounded-md border bg-secondary/30 p-4 text-sm">{active.body}</div>

                {active.replies.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Sent replies</div>
                    {active.replies.map((r) => (
                      <div key={r.id} className="rounded-md border bg-primary/5 p-3 text-sm">
                        {r.body}
                        {r.sentAt && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            sent {format(new Date(r.sentAt), 'MMM d, h:mm a')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Your reply</label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => suggest.mutate(active.id)}
                      disabled={suggest.isPending}
                    >
                      <Sparkles className="mr-2 h-3 w-3" />
                      {suggest.isPending ? 'Thinking…' : 'AI suggest'}
                    </Button>
                  </div>
                  <textarea
                    rows={4}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder={`Reply to ${active.authorHandle}…`}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <Button disabled={!replyDraft.trim()} onClick={() => toast.success('(Stubbed — wire connector)')}>
                      <Send className="mr-2 h-4 w-4" /> Send reply
                    </Button>
                    <Button variant="outline" onClick={() => toast.success('Marked ignored')}>
                      Ignore
                    </Button>
                    <Button variant="outline" onClick={() => toast.success('Hidden')}>
                      Hide
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
