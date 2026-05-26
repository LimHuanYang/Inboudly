'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Clapperboard, Loader2, RefreshCw, Save, Mic2, Film, Download,
  Clock, AlertCircle, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type VideoStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

interface VideoScene {
  id: string;
  order: number;
  text: string;
  visualPrompt: string | null;
  durationSec: number | null;
  voiceUrl: string | null;
  videoUrl: string | null;
}

interface FacelessNiche {
  slug: string;
  label: string;
  description: string;
  voiceTone: string;
  visualStyle: string;
  targetScenes: number;
}

interface VideoProjectDetail {
  id: string;
  niche: string;
  topic: string;
  title: string | null;
  scriptStatus: VideoStatus;
  voiceStatus: VideoStatus;
  videoStatus: VideoStatus;
  exportStatus: VideoStatus;
  durationSec: number | null;
  modelUsed: string | null;
  errorMessage: string | null;
  createdAt: string;
  scenes: VideoScene[];
  nichePreset: FacelessNiche | null;
}

const STATUS_PILL: Record<VideoStatus, { label: string; className: string }> = {
  PENDING:    { label: 'Pending',    className: 'bg-muted text-muted-foreground' },
  GENERATING: { label: 'Generating', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  READY:      { label: 'Ready',      className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  FAILED:     { label: 'Failed',     className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
};

function SceneEditor({
  scene,
  workspaceId,
  onSaved,
}: {
  scene: VideoScene;
  workspaceId: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState(scene.text);
  const [visualPrompt, setVisualPrompt] = useState(scene.visualPrompt ?? '');
  const [durationSec, setDurationSec] = useState(scene.durationSec ?? 5);
  const dirty =
    text !== scene.text ||
    visualPrompt !== (scene.visualPrompt ?? '') ||
    durationSec !== (scene.durationSec ?? 5);

  // Sync if parent updates the scene (e.g. after regen)
  useEffect(() => {
    setText(scene.text);
    setVisualPrompt(scene.visualPrompt ?? '');
    setDurationSec(scene.durationSec ?? 5);
  }, [scene.id, scene.text, scene.visualPrompt, scene.durationSec]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/videos/scenes/${scene.id}`, {
        workspaceId,
        text,
        visualPrompt,
        durationSec,
      }),
    onSuccess: () => {
      toast.success(`Scene ${scene.order + 1} saved`);
      onSaved();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const regenVoice = useMutation({
    mutationFn: () =>
      api.post(`/videos/scenes/${scene.id}/generate-voice`, { workspaceId }),
    onSuccess: () => {
      toast.success(`Voice regenerated for scene ${scene.order + 1}`);
      onSaved();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Scene {scene.order + 1}
            {durationSec ? (
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                ~{durationSec}s
              </span>
            ) : null}
          </h3>
          {dirty && (
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Spoken text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Visual prompt</label>
          <textarea
            value={visualPrompt}
            onChange={(e) => setVisualPrompt(e.target.value)}
            rows={2}
            placeholder="What's on screen for this scene"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Duration (sec)</label>
          <input
            type="number"
            min={2}
            max={15}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value))}
            className="w-16 rounded-md border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Voice (v2) — audio player + per-scene regen */}
        {scene.voiceUrl ? (
          <div className="rounded-md border bg-muted/30 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Mic2 className="h-3 w-3" />
                Voiceover
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => regenVoice.mutate()}
                disabled={regenVoice.isPending}
                className="h-6 px-2 text-[10px]"
              >
                {regenVoice.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <><RefreshCw className="mr-1 h-2.5 w-2.5" />Regen</>
                )}
              </Button>
            </div>
            <audio controls src={scene.voiceUrl} className="h-7 w-full" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const project = useQuery({
    queryKey: ['video', id, workspaceId],
    queryFn: () => api.get<VideoProjectDetail>(`/videos/${id}?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    // Poll while script is still generating
    refetchInterval: (q) => {
      const d = q.state.data as VideoProjectDetail | undefined;
      return d?.scriptStatus === 'GENERATING' || d?.scriptStatus === 'PENDING' ? 2000 : false;
    },
  });

  const regenerate = useMutation({
    mutationFn: () => api.post(`/videos/${id}/regenerate-script`, { workspaceId }),
    onSuccess: () => {
      toast.success('Regenerated script');
      qc.invalidateQueries({ queryKey: ['video', id, workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // v2 voice slice — generates ElevenLabs voiceover for every ready scene.
  // Sequential server-side (~5-10 sec per scene); the project endpoint
  // poll above picks up the status flip automatically.
  const generateVoice = useMutation({
    mutationFn: () => api.post(`/videos/${id}/generate-voice`, { workspaceId }),
    onSuccess: () => {
      toast.success('Voice generation complete');
      qc.invalidateQueries({ queryKey: ['video', id, workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (project.isLoading) {
    return (
      <div className="container py-8 text-sm text-muted-foreground">Loading project…</div>
    );
  }
  if (!project.data) {
    return (
      <div className="container py-8 text-sm text-muted-foreground">
        Project not found.{' '}
        <Link href="/dashboard/videos" className="text-primary hover:underline">Back</Link>
      </div>
    );
  }
  const p = project.data;
  const scriptMeta = STATUS_PILL[p.scriptStatus];

  return (
    <div className="container max-w-5xl py-8">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/dashboard/videos">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to all projects
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Clapperboard className="h-6 w-6 text-primary" />
                {p.title ?? p.topic}
              </CardTitle>
              <CardDescription className="mt-1">
                {p.nichePreset?.label ?? p.niche} · Topic: <em>{p.topic}</em>
                {p.modelUsed && <> · via <code className="text-xs">{p.modelUsed}</code></>}
                {p.durationSec ? <> · ~{p.durationSec}s</> : ''}
              </CardDescription>
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${scriptMeta.className}`}>
              {p.scriptStatus === 'GENERATING' && <Loader2 className="h-3 w-3 animate-spin" />}
              {scriptMeta.label}
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Pipeline status row — Script + Voice now live; Video + Export still v2 */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Script', status: p.scriptStatus, icon: Sparkles, v2: false },
          { label: 'Voice',  status: p.voiceStatus,  icon: Mic2,     v2: false },
          { label: 'Video',  status: p.videoStatus,  icon: Film,     v2: true },
          { label: 'Export', status: p.exportStatus, icon: Download, v2: true },
        ].map(({ label, status, icon: Icon, v2 }) => {
          const meta = STATUS_PILL[status];
          return (
            <div
              key={label}
              className={`rounded-lg border bg-background p-3 ${v2 ? 'opacity-60' : ''}`}
              title={v2 ? 'v3 — coming next sprint' : undefined}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
                  {v2 ? 'v3' : meta.label}
                </span>
              </div>
              <div className="mt-2 text-xs font-medium">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Voice generation panel — appears once script is READY */}
      {p.scriptStatus === 'READY' && p.scenes.length > 0 && (
        <Card className="mt-4">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Mic2 className="h-4 w-4 text-primary" />
                Voiceover
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[p.voiceStatus].className}`}>
                  {STATUS_PILL[p.voiceStatus].label}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Generates an ElevenLabs voice for every scene using your BYOK
                ElevenLabs key. Voice tone is picked based on the niche preset.
                Sequential — ~5-10 sec per scene.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => generateVoice.mutate()}
              disabled={generateVoice.isPending || p.voiceStatus === 'GENERATING'}
            >
              {generateVoice.isPending || p.voiceStatus === 'GENERATING' ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Generating</>
              ) : p.voiceStatus === 'READY' ? (
                <><RefreshCw className="mr-2 h-3.5 w-3.5" />Regenerate all</>
              ) : (
                <><Mic2 className="mr-2 h-3.5 w-3.5" />Generate voice</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {p.errorMessage && (
        <Card className="mt-4">
          <CardContent className="py-3">
            <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{p.errorMessage}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Generating state */}
      {(p.scriptStatus === 'GENERATING' || p.scriptStatus === 'PENDING') && p.scenes.length === 0 && (
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="mb-3 h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Generating script… (~5-15 sec)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scenes */}
      {p.scenes.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Scenes ({p.scenes.length})</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerate.mutate()}
              disabled={regenerate.isPending}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${regenerate.isPending ? 'animate-spin' : ''}`} />
              Regenerate script
            </Button>
          </div>
          {p.scenes.map((scene) => (
            <SceneEditor
              key={scene.id}
              scene={scene}
              workspaceId={workspaceId}
              onSaved={() => qc.invalidateQueries({ queryKey: ['video', id, workspaceId] })}
            />
          ))}

          {/* v3 stub — video + export still to come */}
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <Clock className="mx-auto mb-2 h-6 w-6 text-muted-foreground opacity-50" />
              <p className="text-xs text-muted-foreground">
                <strong>v3 ships next sprint:</strong> Runway/Kling AI video clips per
                scene, Pexels/Pixabay stock-footage fallback, ffmpeg stitching into a
                downloadable MP4, and bulk mode (30 videos for one niche in one batch).
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
