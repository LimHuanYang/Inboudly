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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface PostListItem {
  id: string;
  title: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  variants: Array<{ id: string; platform: string }>;
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'secondary' | 'info'> =
  {
    DRAFT: 'secondary',
    PENDING_APPROVAL: 'warning',
    APPROVED: 'info',
    SCHEDULED: 'info',
    PUBLISHING: 'info',
    PUBLISHED: 'success',
    FAILED: 'danger',
    CANCELLED: 'secondary',
  };

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const posts = useQuery({
    queryKey: ['posts', workspaceId],
    queryFn: () => api.get<PostListItem[]>(`/posts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
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

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            {totalScheduled} scheduled · {totalPublished} published
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
                    {dayPosts.slice(0, 3).map((p) => (
                      <Link
                        key={p.id}
                        href={`/dashboard/composer?postId=${p.id}`}
                        className="block truncate rounded border-l-2 border-primary bg-primary/5 px-1.5 py-1 text-[11px] hover:bg-primary/10"
                      >
                        <div className="flex items-center gap-1">
                          <Badge
                            variant={STATUS_VARIANT[p.status] ?? 'default'}
                            className="px-1 py-0 text-[9px]"
                          >
                            {p.status[0]}
                          </Badge>
                          <span className="truncate">
                            {p.title ?? p.variants[0]?.platform ?? 'Untitled'}
                          </span>
                        </div>
                      </Link>
                    ))}
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
                <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>{p.status}</Badge>
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
