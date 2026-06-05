'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard, Loader2, CheckCircle2, XCircle, X } from 'lucide-react';
import { api } from '@/lib/api-client';

interface VideoJob {
  id: string;
  prompt: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  errorMessage: string | null;
  mediaAsset: { id: string; url: string } | null;
  createdAt: string;
}

interface Me {
  memberships?: { workspace?: { id: string } }[];
}

const DISMISSED_KEY = 'inboudly:dismissed-video-jobs';
const isTerminal = (s: VideoJob['status']) => s === 'READY' || s === 'FAILED';

export function GenerationsTray() {
  const [open, setOpen] = useState(false);
  // Job ids the user dismissed from the tray. Persisted so they don't reappear
  // on the next poll/reload. The DB record + media asset are left untouched.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const persistDismissed = (next: Set<string>) => {
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore storage failures */
    }
  };

  // queryKey and queryFn MUST match Composer's me query exactly to share the cache.
  // Composer uses: queryKey: ['me'], queryFn: () => api.get<any>('/auth/me')
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const jobs = useQuery({
    queryKey: ['video-jobs', workspaceId],
    queryFn: () => api.get<VideoJob[]>(`/ai/video?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    // TanStack Query v5: refetchInterval callback receives the query object; data is at query.state.data
    refetchInterval: (query) => {
      const data = query.state.data as VideoJob[] | undefined;
      return data?.some((j) => j.status === 'GENERATING' || j.status === 'PENDING') ? 2500 : false;
    },
    // Keep polling even when the tab is backgrounded, so a finished clip is
    // announced in the tray even if the user navigated to another tab.
    refetchIntervalInBackground: true,
  });

  const list = (jobs.data ?? []).filter((j) => !dismissed.has(j.id));
  const active = list.filter((j) => j.status === 'GENERATING' || j.status === 'PENDING').length;
  const completedCount = list.filter((j) => isTerminal(j.status)).length;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    persistDismissed(next);
  };

  const clearCompleted = () => {
    const next = new Set(dismissed);
    list.forEach((j) => {
      if (isTerminal(j.status)) next.add(j.id);
    });
    persistDismissed(next);
  };

  if (!workspaceId || list.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div id="generations-panel" className="mb-2 w-80 rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Video generations</span>
            <div className="flex items-center gap-1">
              {completedCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  Clear completed
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close generations tray"
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {list.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0">
                  {j.status === 'READY' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                  ) : j.status === 'FAILED' ? (
                    <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{j.prompt}</p>
                  <p className="text-xs text-muted-foreground">
                    {j.status === 'READY'
                      ? 'Ready'
                      : j.status === 'FAILED'
                        ? (j.errorMessage ?? 'Failed')
                        : 'Generating…'}
                  </p>
                </div>
                {j.status === 'READY' && j.mediaAsset && (
                  <video
                    src={j.mediaAsset.url}
                    className="h-10 w-10 rounded object-cover"
                    muted
                    preload="metadata"
                    aria-label={`Preview of: ${j.prompt}`}
                  />
                )}
                {/* Dismiss is only offered for finished/failed jobs — an in-flight job can't be removed. */}
                {isTerminal(j.status) && (
                  <button
                    onClick={() => dismiss(j.id)}
                    aria-label={`Dismiss ${j.status === 'FAILED' ? 'failed' : 'completed'} job: ${j.prompt}`}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="generations-panel"
        className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium shadow-lg hover:bg-secondary"
      >
        {active > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        ) : (
          <Clapperboard className="h-4 w-4" aria-hidden="true" />
        )}
        {active > 0 ? `Generating ${active}…` : 'Generations'}
      </button>
    </div>
  );
}
