'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Sparkles, Send, Wand2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Intent = 'PURCHASE_INTENT' | 'COMPLAINT' | 'QUESTION' | 'FAN_ENGAGEMENT' | 'SPAM' | 'UNCLASSIFIED';
type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' | 'UNANALYZED';
type ReplyStatus = 'PENDING' | 'REPLIED' | 'HIDDEN' | 'IGNORED';
type Urgency = 'low' | 'medium' | 'high';

interface ReplySuggestion {
  text: string;
  tone: string;
  rationale: string;
}

interface SuggestRepliesResult {
  ok: boolean;
  intent: Intent;
  sentiment: Sentiment;
  urgency: Urgency;
  suggestions: ReplySuggestion[];
  modelUsed?: string;
  message?: string;
}

interface ClassifyResult {
  ok: boolean;
  commentId: string;
  intent: Intent;
  sentiment: Sentiment;
  confidence: number;
  urgency: Urgency;
  reasoning: string;
  message?: string;
}

const URGENCY_META: Record<Urgency, { label: string; className: string }> = {
  high:   { label: '🔥 urgent',  className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  medium: { label: '⚡ medium',   className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  low:    { label: 'low',        className: 'bg-muted text-muted-foreground' },
};

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
  const qc = useQueryClient();
  const [intentFilter, setIntentFilter] = useState<Intent | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<ReplyStatus | 'ALL'>('PENDING');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestRepliesResult | null>(null);

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

  // v2: real AI suggestions via BYOK, brand-voice-aware, intent-specific.
  // Returns 3-4 options with tone + rationale so the user picks the best fit.
  const suggest = useMutation({
    mutationFn: (commentId: string) =>
      api.post<SuggestRepliesResult>(`/comments/${commentId}/suggest-replies`, { workspaceId }),
    onSuccess: (data) => {
      setSuggestions(data);
      if (data.ok && data.suggestions[0]) {
        toast.success(`Generated ${data.suggestions.length} reply options`);
      } else if (!data.ok) {
        toast.error(data.message ?? 'Could not generate suggestions');
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // v2: real intent + sentiment classification, persisted to the row.
  // Triggers an inbox re-fetch so the chip + urgency update live.
  const classify = useMutation({
    mutationFn: (commentId: string) =>
      api.post<ClassifyResult>(`/comments/${commentId}/classify`, { workspaceId }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Classified as ${r.intent} (${Math.round(r.confidence * 100)}% confident)`);
        qc.invalidateQueries({ queryKey: ['inbox', workspaceId] });
      } else {
        toast.error(r.message ?? 'Classification failed');
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Bulk-classify all UNCLASSIFIED comments in the current view.
  const classifyAll = useMutation({
    mutationFn: () => {
      const ids = (inbox.data ?? [])
        .filter((c) => c.intent === 'UNCLASSIFIED')
        .map((c) => c.id)
        .slice(0, 50);
      if (!ids.length) throw new Error('No unclassified comments in view');
      return api.post<{ ok: boolean; classified: number; failed: number }>(
        '/comments/classify-batch',
        { workspaceId, commentIds: ids },
      );
    },
    onSuccess: (r) => {
      toast.success(`Classified ${r.classified} comments (${r.failed} failed)`);
      qc.invalidateQueries({ queryKey: ['inbox', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Unified comments + DMs across all your connected accounts. AI
            classifies intent + sentiment + urgency; reply suggestions match
            your brand voice.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => classifyAll.mutate()}
          disabled={
            classifyAll.isPending ||
            !workspaceId ||
            !(inbox.data ?? []).some((c) => c.intent === 'UNCLASSIFIED')
          }
        >
          {classifyAll.isPending ? (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Classifying…</>
          ) : (
            <><Wand2 className="mr-2 h-3.5 w-3.5" />Classify unclassified</>
          )}
        </Button>
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
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{active.authorHandle}</div>
                    <div className="text-xs text-muted-foreground">
                      {active.socialAccount.platform} · {active.socialAccount.handle} ·{' '}
                      {format(new Date(active.postedAt), 'MMM d, h:mm a')}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={INTENT_VARIANT[active.intent]}>{INTENT_LABEL[active.intent]}</Badge>
                    {active.intent === 'UNCLASSIFIED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => classify.mutate(active.id)}
                        disabled={classify.isPending}
                      >
                        {classify.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><Wand2 className="mr-1 h-3 w-3" />Classify</>
                        )}
                      </Button>
                    )}
                  </div>
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
                      onClick={() => {
                        setSuggestions(null);
                        suggest.mutate(active.id);
                      }}
                      disabled={suggest.isPending}
                    >
                      {suggest.isPending ? (
                        <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Thinking…</>
                      ) : (
                        <><Sparkles className="mr-2 h-3 w-3" />AI suggest replies</>
                      )}
                    </Button>
                  </div>

                  {/* Suggestion picker — multiple options with tone + rationale */}
                  {suggestions?.ok && suggestions.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Pick a suggestion (or use as starting point):
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${URGENCY_META[suggestions.urgency].className}`}
                        >
                          {URGENCY_META[suggestions.urgency].label}
                        </span>
                      </div>
                      {suggestions.suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setReplyDraft(s.text);
                            toast.success(`Loaded "${s.tone}" reply`);
                          }}
                          className={`group block w-full rounded-md border p-3 text-left transition hover:border-primary hover:bg-primary/5 ${
                            replyDraft === s.text ? 'border-primary bg-primary/5' : ''
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <Badge variant="outline" className="text-[10px] capitalize">{s.tone}</Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {s.text.length} chars
                            </span>
                          </div>
                          <p className="text-sm">{s.text}</p>
                          <p className="mt-1 text-[10px] italic text-muted-foreground">
                            Why: {s.rationale}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {suggestions && !suggestions.ok && (
                    <p className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mr-1 inline h-3 w-3" />
                      {suggestions.message}
                    </p>
                  )}

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
