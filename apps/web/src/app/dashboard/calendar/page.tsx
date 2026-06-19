'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PostStatusBadge, PostStatusDot, getStatusMeta } from '@/components/post-status-badge';

interface PostListItem {
  id: string;
  title: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  variants: Array<{ id: string; platform: string }>;
}

/** True when a post is mid-publish or due within 2 min — worth live-polling for. */
function hasActivePost(data: PostListItem[] | undefined): boolean {
  if (!data) return false;
  const soon = Date.now() + 2 * 60_000;
  return data.some(
    (p) =>
      p.status === 'PUBLISHING' ||
      (p.status === 'SCHEDULED' &&
        p.scheduledFor != null &&
        new Date(p.scheduledFor).getTime() <= soon),
  );
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const posts = useQuery({
    queryKey: ['posts', workspaceId],
    queryFn: () => api.get<PostListItem[]>(`/posts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    // Live-refresh while anything is publishing or about to: the minute-cron drives
    // SCHEDULED → PUBLISHING → PUBLISHED server-side. Idle otherwise — no needless polling.
    refetchInterval: (query) => (hasActivePost(query.state.data) ? 15_000 : false),
  });

  // Group posts by yyyy-MM-dd of scheduledFor (or publishedAt as fallback)
  const postsByDay = useMemo(() => {
    const map = new Map<string, PostListItem[]>();
    for (const p of posts.data ?? []) {
      const dateStr = p.scheduledFor ?? p.publishedAt;
      if (!dateStr) continue;
      const key = format(new Date(dateStr), 'yyyy-MM-dd');
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [posts.data]);

  // Build the 6×7 month grid
  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(monthStart);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = new Date(d.getTime() + 24 * 3600_000);
    }
    return out;
  }, [cursor]);

  const totalScheduled = (posts.data ?? []).filter((p) => p.status === 'SCHEDULED').length;
  const totalPublished = (posts.data ?? []).filter((p) => p.status === 'PUBLISHED').length;
  const isLive = hasActivePost(posts.data);

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {totalScheduled} scheduled · {totalPublished} published
            </span>
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                Live
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center text-lg font-medium">
            {format(cursor, 'MMMM yyyy')}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button asChild>
            <Link href="/dashboard/composer">
              <Plus className="mr-2 h-4 w-4" /> New post
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b text-xs font-medium text-muted-foreground">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="px-3 py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayPosts = postsByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, cursor);
              const today = isToday(day);
              return (
                <div
                  key={key}
                  className={`min-h-[120px] border-b border-r p-2 last-of-type:border-r-0 ${
                    inMonth ? 'bg-background' : 'bg-secondary/40'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span
                      className={`text-xs ${
                        today
                          ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                          : inMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {dayPosts.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map((p) => {
                      const meta = getStatusMeta(p.status);
                      const label = p.title ?? p.variants[0]?.platform ?? 'Untitled';
                      return (
                        <Link
                          key={p.id}
                          href={`/dashboard/composer?postId=${p.id}`}
                          title={`${meta.label} — ${label}`}
                          className={`block rounded border-l-2 px-1.5 py-1 text-[11px] hover:opacity-90 ${meta.borderClass} ${meta.tintClass}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <PostStatusDot status={p.status} />
                            <span className="truncate">{label}</span>
                          </div>
                        </Link>
                      );
                    })}
                    {dayPosts.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{dayPosts.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming list (next 14 days) */}
      <Card className="mt-6">
        <CardContent className="pt-6">
          <h2 className="mb-4 text-lg font-semibold">Upcoming</h2>
          {(posts.data ?? [])
            .filter((p) => p.scheduledFor && new Date(p.scheduledFor) > new Date())
            .sort((a, b) => +new Date(a.scheduledFor!) - +new Date(b.scheduledFor!))
            .slice(0, 10)
            .map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b py-3 last:border-b-0">
                <div>
                  <div className="font-medium">{p.title ?? 'Untitled'}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(p.scheduledFor!), 'EEE, MMM d · h:mm a')}</span>
                    <span>·</span>
                    <span>{p.variants.map((v) => v.platform).join(', ')}</span>
                  </div>
                </div>
                <PostStatusBadge status={p.status} />
              </div>
            ))}
          {(posts.data ?? []).filter((p) => p.scheduledFor && new Date(p.scheduledFor) > new Date()).length ===
            0 && (
            <p className="text-sm text-muted-foreground">No upcoming scheduled posts.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
