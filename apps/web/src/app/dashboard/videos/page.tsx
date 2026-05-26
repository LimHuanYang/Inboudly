'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clapperboard, Loader2, Sparkles, Trash2, Plus, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type VideoStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

interface FacelessNiche {
  slug: string;
  label: string;
  description: string;
  examplePrompt: string;
  targetScenes: number;
  voiceTone: string;
  visualStyle: string;
}

interface VideoProject {
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
  sceneCount: number;
}

const STATUS_META: Record<VideoStatus, { label: string; className: string; icon: any }> = {
  PENDING:    { label: 'Pending',    className: 'bg-muted text-muted-foreground',                    icon: Clock },
  GENERATING: { label: 'Generating', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: Loader2 },
  READY:      { label: 'Ready',      className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  FAILED:     { label: 'Failed',     className: 'bg-red-500/10 text-red-600 dark:text-red-400',       icon: AlertCircle },
};

export default function VideosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [niche, setNiche] = useState<string>('');
  const [topic, setTopic] = useState('');

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const niches = useQuery({
    queryKey: ['video-niches'],
    queryFn: () => api.get<FacelessNiche[]>('/videos/niches'),
  });

  const projects = useQuery({
    queryKey: ['videos', workspaceId],
    queryFn: () => api.get<VideoProject[]>(`/videos?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
    // Poll while any project is still generating so status pills update live
    refetchInterval: (query) => {
      const data = query.state.data as VideoProject[] | undefined;
      return data?.some((p) => p.scriptStatus === 'GENERATING' || p.scriptStatus === 'PENDING')
        ? 3000
        : false;
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<VideoProject>('/videos', { workspaceId, niche, topic }),
    onSuccess: (p) => {
      toast.success(`Created "${p.topic}" — generating script…`);
      qc.invalidateQueries({ queryKey: ['videos', workspaceId] });
      setTopic('');
      router.push(`/dashboard/videos/${p.id}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/videos/${id}?workspaceId=${workspaceId}`),
    onSuccess: () => {
      toast.success('Project deleted');
      qc.invalidateQueries({ queryKey: ['videos', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const selectedNiche = niches.data?.find((n) => n.slug === niche);

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Clapperboard className="h-7 w-7 text-primary" />
            Faceless Video Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Topic → AI-scripted short-form video → ElevenLabs voiceover per scene.
            v3 layers in video clips + downloadable MP4 export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning" className="text-xs">v2 · Script + Voice</Badge>
          <Badge variant="info" className="text-xs">Phase 2B · Flagship</Badge>
        </div>
      </div>

      {/* New project form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4" /> New project
          </CardTitle>
          <CardDescription>
            Pick a niche preset (it shapes the hook style, pacing, and voice tone),
            then enter the topic. AI generates a scene-by-scene script.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium">Niche preset</label>
              <select
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={niches.isLoading || !niches.data}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— select a niche —</option>
                {niches.data?.map((n) => (
                  <option key={n.slug} value={n.slug}>{n.label}</option>
                ))}
              </select>
              {selectedNiche && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {selectedNiche.description}
                  <br />
                  Target: {selectedNiche.targetScenes} scenes · {selectedNiche.voiceTone} voice
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={selectedNiche?.examplePrompt ?? 'e.g. Why the universe is mostly empty'}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!niche || !topic.trim() || create.isPending || !workspaceId}
          >
            {create.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating + scripting</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" />Create project + generate script</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Project list */}
      {projects.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading projects…
          </CardContent>
        </Card>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Clapperboard className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">
              No video projects yet. Create your first one above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.data!.map((p) => {
            const meta = STATUS_META[p.scriptStatus];
            const Icon = meta.icon;
            return (
              <Card key={p.id} className="flex h-full flex-col transition-shadow hover:shadow-md">
                <CardContent className="flex flex-1 flex-col gap-3 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {p.niche.replace('-', ' ')}
                    </Badge>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
                    >
                      <Icon className={`h-3 w-3 ${p.scriptStatus === 'GENERATING' ? 'animate-spin' : ''}`} />
                      {meta.label}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-semibold leading-tight">
                      {p.title ?? p.topic}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.topic}</p>
                  </div>

                  {p.errorMessage && (
                    <p className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
                      {p.errorMessage}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      {p.sceneCount > 0 ? `${p.sceneCount} scenes` : '—'}
                      {p.durationSec ? ` · ~${p.durationSec}s` : ''}
                    </span>
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div className="flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                      <Link href={`/dashboard/videos/${p.id}`}>Open</Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => {
                        if (confirm(`Delete "${p.title ?? p.topic}"?`)) remove.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
