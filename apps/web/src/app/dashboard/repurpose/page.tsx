'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wand2, Youtube, Mic, Globe, Upload } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLATFORM_SPECS, type SocialPlatform } from '@inboudly/shared';

type SourceKind = 'upload' | 'youtube' | 'podcast' | 'blog';

const PHASE_1_PLATFORMS: SocialPlatform[] = ['INSTAGRAM', 'TIKTOK', 'REDNOTE'];

const KIND_META: Record<SourceKind, { icon: typeof Youtube; label: string; placeholder: string }> = {
  upload: { icon: Upload, label: 'Upload file', placeholder: 'Use the Media library to upload first' },
  youtube: { icon: Youtube, label: 'YouTube URL', placeholder: 'https://youtube.com/watch?v=…' },
  podcast: { icon: Mic, label: 'Podcast / RSS', placeholder: 'https://feed.example.com/podcast.xml' },
  blog: { icon: Globe, label: 'Blog / article', placeholder: 'https://example.com/article' },
};

export default function RepurposePage() {
  const [kind, setKind] = useState<SourceKind>('youtube');
  const [url, setUrl] = useState('');
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['TIKTOK', 'INSTAGRAM']);
  const [clipCount, setClipCount] = useState(5);
  const [burnInCaptions, setBurnInCaptions] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ jobId: string; status: string }>('/repurpose', {
        workspaceId,
        source: { kind, url },
        targetPlatforms: platforms,
        clipCount,
        burnInCaptions,
        autoReframe: true,
      }),
    onSuccess: (data) => {
      setActiveJobId(data.jobId);
      toast.success('Repurpose job queued');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const status = useQuery({
    queryKey: ['repurpose-job', activeJobId],
    queryFn: () => api.get<{ status: string; progress: number; returnValue?: any }>(
      `/repurpose/jobs/${activeJobId}`,
    ),
    enabled: !!activeJobId,
    refetchInterval: 3000,
  });

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Repurpose</h1>
        <p className="text-sm text-muted-foreground">
          Drop in a long video, podcast, or article — get optimized clips for every platform.
          Powered by Whisper + Claude clip selection (research: arXiv 2512.11399).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source</CardTitle>
          <CardDescription>Where is the long-form content?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_META) as SourceKind[]).map((k) => {
              const meta = KIND_META[k];
              const Icon = meta.icon;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-colors ${
                    kind === k ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {kind !== 'upload' && (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={KIND_META[kind].placeholder}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          {kind === 'upload' && (
            <p className="rounded-md border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Upload a video first via the Media library, then come back here and select it (UI coming Week 4 finish).
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Target platforms</CardTitle>
          <CardDescription>Each platform gets optimised clips at the right aspect ratio.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PHASE_1_PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  platforms.includes(p)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-secondary'
                }`}
              >
                {PLATFORM_SPECS[p].displayName}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Clips per platform</label>
            <input
              type="number"
              min={1}
              max={20}
              value={clipCount}
              onChange={(e) => setClipCount(Number(e.target.value))}
              className="mt-1 w-32 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={burnInCaptions}
              onChange={(e) => setBurnInCaptions(e.target.checked)}
            />
            Burn in captions (recommended — 85% of viewers watch with sound off)
          </label>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button
          size="lg"
          disabled={submit.isPending || !platforms.length || (!url && kind !== 'upload')}
          onClick={() => submit.mutate()}
        >
          <Wand2 className="mr-2 h-4 w-4" />
          {submit.isPending ? 'Queuing…' : `Generate ${platforms.length * clipCount} clips`}
        </Button>
      </div>

      {activeJobId && status.data && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge variant={status.data.status === 'completed' ? 'success' : 'info'}>
                {status.data.status}
              </Badge>
              <span>Job {activeJobId}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${typeof status.data.progress === 'number' ? status.data.progress : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {status.data.status === 'completed'
                ? `Done — ${status.data.returnValue?.generatedClips ?? 0} clips generated. Find them in Media.`
                : 'Processing — transcription → clip selection → ffmpeg encode.'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
