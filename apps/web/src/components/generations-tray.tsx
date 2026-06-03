'use client';

import { useState } from 'react';
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

export function GenerationsTray() {
  const [open, setOpen] = useState(false);

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
  });

  const list = jobs.data ?? [];
  const active = list.filter((j) => j.status === 'GENERATING' || j.status === 'PENDING').length;

  if (!workspaceId || list.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="mb-2 w-80 rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Video generations</span>
            <button onClick={() => setOpen(false)} aria-label="Close generations tray">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {list.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-3 py-2">
                <span className="shrink-0">
                  {j.status === 'READY' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : j.status === 'FAILED' ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
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
                  <video src={j.mediaAsset.url} className="h-10 w-10 rounded object-cover" muted />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium shadow-lg hover:bg-secondary"
      >
        {active > 0 ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Clapperboard className="h-4 w-4" />
        )}
        {active > 0 ? `Generating ${active}…` : 'Generations'}
      </button>
    </div>
  );
}
