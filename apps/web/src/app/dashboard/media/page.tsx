'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface MediaAsset {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'GIF';
  source: 'UPLOAD' | 'AI_GENERATED' | 'REPURPOSED' | 'STOCK';
  url: string;
  thumbnailUrl?: string | null;
  filename: string;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  UPLOAD: 'Upload',
  AI_GENERATED: 'AI',
  REPURPOSED: 'Repurposed',
  STOCK: 'Stock',
};

export default function MediaPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const list = useQuery({
    queryKey: ['media', workspaceId],
    queryFn: () => api.get<MediaAsset[]>(`/media?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const videoJobs = useQuery({
    queryKey: ['video-jobs', workspaceId],
    queryFn: () => api.get<any[]>(`/ai/video?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    // TanStack Query v5: refetchInterval callback receives the query object.
    refetchInterval: (query) =>
      (query.state.data as any[] | undefined)?.some(
        (j) => j.status === 'GENERATING' || j.status === 'PENDING',
      )
        ? 2500
        : false,
    // Keep polling on a backgrounded tab so in-flight renders resolve to tiles.
    refetchIntervalInBackground: true,
  });

  const pending = (videoJobs.data ?? []).filter(
    (j) => j.status === 'GENERATING' || j.status === 'PENDING',
  );

  return (
    <div className="container py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Media library</h1>
        <p className="text-sm text-muted-foreground">
          Uploads, AI-generated images and videos, and repurposed clips.
        </p>
      </div>

      {!list.data?.length && !pending.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Empty for now</CardTitle>
            <CardDescription>
              Anything you generate in the Composer or output from the Repurpose engine lands here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {pending.map((j) => (
            <div
              key={j.id}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-secondary/30 p-3 text-center"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="line-clamp-2 text-xs text-muted-foreground">{j.prompt}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Rendering…
              </span>
            </div>
          ))}
          {(list.data ?? []).map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <div className="aspect-square bg-secondary">
                {m.type === 'IMAGE' || m.type === 'GIF' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbnailUrl ?? m.url}
                    alt={m.filename}
                    className="h-full w-full object-cover"
                  />
                ) : m.type === 'VIDEO' ? (
                  <video src={m.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Audio
                  </div>
                )}
              </div>
              <CardContent className="p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="truncate">{m.filename}</span>
                  <Badge variant="secondary" className="text-[9px]">
                    {SOURCE_LABEL[m.source]}
                  </Badge>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {m.width && m.height ? `${m.width}×${m.height}` : ''}
                  {m.durationSec ? ` · ${Math.round(m.durationSec)}s` : ''}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {format(new Date(m.createdAt), 'MMM d')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
