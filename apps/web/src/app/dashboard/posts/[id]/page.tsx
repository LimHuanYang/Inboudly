'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Loader2, RotateCw } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PostStatusBadge } from '@/components/post-status-badge';

interface Publication {
  id: string;
  status: string; // PublicationStatus
  platformPostUrl: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
}
interface Variant {
  id: string;
  platform: string;
  publications: Publication[];
}
interface PostDetail {
  id: string;
  title: string | null;
  status: string; // PostStatus
  scheduledFor: string | null;
  publishedAt: string | null;
  variants: Variant[];
}

const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  REDNOTE: 'RedNote 小红书',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
};
const PLATFORM_BG: Record<string, string> = {
  INSTAGRAM: 'bg-pink-600',
  TIKTOK: 'bg-neutral-900',
  REDNOTE: 'bg-red-500',
  YOUTUBE: 'bg-red-600',
  FACEBOOK: 'bg-blue-600',
  LINKEDIN: 'bg-sky-700',
};

// Per-platform publication status (PublicationStatus enum). color-not-only: each
// pairs a label + dot, and failures carry the error text.
const PUB_META: Record<string, { label: string; text: string; dot: string }> = {
  PENDING: { label: 'Queued', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' },
  PUBLISHING: { label: 'Publishing…', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500 animate-pulse' },
  SUCCESS: { label: 'Published', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  FAILED: { label: 'Failed', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  RETRY_SCHEDULED: { label: 'Retrying', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
};

function platformInitial(platform: string): string {
  if (platform === 'REDNOTE') return '小';
  return (PLATFORM_LABEL[platform] ?? platform).charAt(0);
}

function pubMeta(status: string) {
  return PUB_META[status] ?? { label: status, text: 'text-muted-foreground', dot: 'bg-slate-400' };
}

export default function PostDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const qc = useQueryClient();

  const post = useQuery({
    queryKey: ['post', id],
    queryFn: () => api.get<PostDetail>(`/posts/${id}`),
    enabled: !!id,
    // Live-refresh while the post is actively publishing (cron drives the rows).
    refetchInterval: (query) => (query.state.data?.status === 'PUBLISHING' ? 5000 : false),
  });

  // Re-publish: publish-now is idempotent (skips platforms already SUCCESS), so
  // it cleanly re-attempts only the platforms that failed / haven't gone out.
  const retry = useMutation({
    mutationFn: () => api.post<PostDetail>(`/posts/${id}/publish-now`, {}),
    onSuccess: (updated) => {
      qc.setQueryData(['post', id], updated);
      qc.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Re-publishing', {
        description: "Re-attempting the platforms that haven't succeeded yet.",
        duration: 6000,
      });
    },
    onError: (err: any) =>
      toast.error("Couldn't re-publish", { description: err?.message ?? 'Please try again.', duration: 8000 }),
  });

  const p = post.data;
  const canRetry = !!p && (p.status === 'PARTIALLY_PUBLISHED' || p.status === 'FAILED');

  return (
    <div className="container max-w-3xl py-8">
      <Link
        href="/dashboard/calendar"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Calendar
      </Link>

      {post.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading post…
        </div>
      )}

      {post.isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this post. It may have been deleted, or you don&apos;t have access.
          </CardContent>
        </Card>
      )}

      {p && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{p.title ?? 'Untitled post'}</h1>
              <div className="mt-2 flex items-center gap-2">
                <PostStatusBadge status={p.status} />
                {p.status === 'PUBLISHED' && p.publishedAt && (
                  <span className="text-sm text-muted-foreground">
                    Published {format(new Date(p.publishedAt), 'EEE, MMM d · h:mm a')}
                  </span>
                )}
                {p.status === 'SCHEDULED' && p.scheduledFor && (
                  <span className="text-sm text-muted-foreground">
                    for {format(new Date(p.scheduledFor), 'EEE, MMM d · h:mm a')}
                  </span>
                )}
              </div>
            </div>
            {canRetry && (
              <Button onClick={() => retry.mutate()} disabled={retry.isPending}>
                {retry.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="mr-2 h-4 w-4" />
                )}
                {retry.isPending ? 'Re-publishing…' : 'Retry failed now'}
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">Publish status</div>
              {p.variants.length === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  This post has no platform variants yet.
                </div>
              )}
              {p.variants.map((v) => {
                const pub = v.publications[0];
                const meta = pub ? pubMeta(pub.status) : null;
                return (
                  <div key={v.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${
                        PLATFORM_BG[v.platform] ?? 'bg-slate-500'
                      }`}
                      aria-hidden="true"
                    >
                      {platformInitial(v.platform)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{PLATFORM_LABEL[v.platform] ?? v.platform}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {!pub && 'Not published yet'}
                        {pub?.status === 'SUCCESS' &&
                          (pub.publishedAt
                            ? `Published ${format(new Date(pub.publishedAt), 'MMM d, h:mm a')}`
                            : 'Published')}
                        {pub?.status === 'PUBLISHING' && 'Sending to platform…'}
                        {pub?.status === 'PENDING' && 'Queued'}
                        {pub?.status === 'FAILED' && (
                          <span className="text-red-600 dark:text-red-400">
                            {pub.errorMessage ?? 'Publish failed.'}
                          </span>
                        )}
                        {pub?.status === 'RETRY_SCHEDULED' && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {pub.errorMessage ? `${pub.errorMessage} · ` : ''}attempt {pub.retryCount + 1} ·{' '}
                            {pub.nextRetryAt
                              ? `next try ${formatDistanceToNowStrict(new Date(pub.nextRetryAt), { addSuffix: true })}`
                              : 'retrying soon'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {meta && (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      )}
                      {pub?.status === 'SUCCESS' && pub.platformPostUrl && (
                        <a
                          href={pub.platformPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
