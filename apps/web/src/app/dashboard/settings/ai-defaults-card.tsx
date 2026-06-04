'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sparkles, Image as ImageIcon, Loader2, Clapperboard } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProviderState {
  configured: boolean;
  masked: string | null;
  model: string | null;
}

interface CredsView {
  gemini: ProviderState;
  openai: ProviderState;
  anthropic: ProviderState;
  geminiImageModel: string | null;
  pollinationsModel: string | null;
  preferredTextProvider: 'claude' | 'gemini' | null;
  preferredImageProvider: 'openai' | 'gemini' | 'pollinations' | null;
  pollinationsVideoModel: string | null;
  runwayModel: string | null;
  klingModel: string | null;
  veoVideoModel: string | null;
  preferredVideoProvider: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
}

type ModelOption = { value: string; label: string };

const CLAUDE_MODELS: ModelOption[] = [
  { value: 'claude-opus-4-7',   label: 'claude-opus-4-7 — most capable' },
  { value: 'claude-sonnet-4-7', label: 'claude-sonnet-4-7 — newest balanced' },
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 — smart (default)' },
  { value: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5 — previous' },
  { value: 'claude-haiku-4-5',  label: 'claude-haiku-4-5 — fastest & cheapest' },
];
const GEMINI_TEXT_MODELS: ModelOption[] = [
  { value: 'gemini-2.5-pro',            label: 'gemini-2.5-pro — best quality' },
  { value: 'gemini-2.5-flash',          label: 'gemini-2.5-flash — fast & free (default)' },
  { value: 'gemini-2.5-flash-lite',     label: 'gemini-2.5-flash-lite — cheapest' },
  { value: 'gemini-2.0-flash',          label: 'gemini-2.0-flash — older' },
  { value: 'gemini-2.0-flash-thinking', label: 'gemini-2.0-flash-thinking — reasoning' },
];
const OPENAI_IMAGE_MODELS: ModelOption[] = [
  { value: 'gpt-image-1', label: 'gpt-image-1 — latest (default)' },
  { value: 'dall-e-3',    label: 'dall-e-3 — older' },
  { value: 'dall-e-2',    label: 'dall-e-2 — cheapest' },
];
const GEMINI_IMAGE_MODELS: ModelOption[] = [
  { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image — Nano Banana (default)' },
];
const POLLINATIONS_IMAGE_MODELS: ModelOption[] = [
  { value: 'flux',         label: 'flux — best quality (default)' },
  { value: 'flux-realism', label: 'flux-realism — photorealistic' },
  { value: 'flux-anime',   label: 'flux-anime — anime / illustration' },
  { value: 'flux-3d',      label: 'flux-3d — 3D render' },
  { value: 'turbo',        label: 'turbo — fastest' },
];

const DEMO_VIDEO_MODELS: ModelOption[] = [
  { value: 'demo', label: 'demo — instant sample clip (free, default)' },
];
const POLLINATIONS_VIDEO_MODELS: ModelOption[] = [
  { value: 'pollinations-t2v', label: 'pollinations-t2v — free text-to-video' },
];
const RUNWAY_VIDEO_MODELS: ModelOption[] = [
  { value: 'runway-gen3', label: 'runway-gen3 — Gen-3 Alpha' },
];
const KLING_VIDEO_MODELS: ModelOption[] = [
  { value: 'kling-v2', label: 'kling-v2 — Kling 2.0' },
];
const VEO_VIDEO_MODELS: ModelOption[] = [
  { value: 'veo-3', label: 'veo-3 — Google Veo 3' },
];

// Which providers have a working adapter in this build. Others show as "coming soon".
const VIDEO_PROVIDER_READY: Record<string, boolean> = {
  demo: true, pollinations: false, runway: false, kling: false, veo: false,
};

// Map (task, provider) → the credentials model field the PATCH endpoint expects.
const MODEL_FIELD: Record<string, string> = {
  'caption:claude': 'anthropicModel',
  'caption:gemini': 'geminiModel',
  'image:openai': 'openaiModel',
  'image:gemini': 'geminiImageModel',
  'image:pollinations': 'pollinationsModel',
  'video:pollinations': 'pollinationsVideoModel',
  'video:runway': 'runwayModel',
  'video:kling': 'klingModel',
  'video:veo': 'veoVideoModel',
};

export function AiDefaultsCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () => api.get<CredsView>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });

  // Local state mirrors the server but updates instantly on change.
  const [captionProvider, setCaptionProvider] = useState<'claude' | 'gemini' | ''>('');
  const [captionModel, setCaptionModel] = useState('');
  const [imageProvider, setImageProvider] = useState<'openai' | 'gemini' | 'pollinations' | ''>('');
  const [imageModel, setImageModel] = useState('');
  const [videoProvider, setVideoProvider] = useState<'demo' | 'pollinations' | 'runway' | 'kling' | 'veo'>('demo');
  const [videoModel, setVideoModel] = useState('demo');

  useEffect(() => {
    if (!data) return;
    const cp = data.preferredTextProvider
      ?? (data.anthropic.configured ? 'claude' : data.gemini.configured ? 'gemini' : '');
    setCaptionProvider(cp);
    setCaptionModel(
      cp === 'claude' ? (data.anthropic.model ?? 'claude-sonnet-4-6')
        : cp === 'gemini' ? (data.gemini.model ?? 'gemini-2.5-flash') : '',
    );
    const ip = data.preferredImageProvider
      ?? (data.openai.configured ? 'openai' : data.gemini.configured ? 'gemini' : 'pollinations');
    setImageProvider(ip);
    setImageModel(
      ip === 'openai' ? (data.openai.model ?? 'gpt-image-1')
        : ip === 'gemini' ? (data.geminiImageModel ?? 'gemini-2.5-flash-image')
          : (data.pollinationsModel ?? 'flux'),
    );
    const vp = data.preferredVideoProvider ?? 'demo';
    setVideoProvider(vp);
    setVideoModel(
      vp === 'demo' ? 'demo'
        : vp === 'pollinations' ? (data.pollinationsVideoModel ?? 'pollinations-t2v')
          : vp === 'runway' ? (data.runwayModel ?? 'runway-gen3')
            : vp === 'kling' ? (data.klingModel ?? 'kling-v2')
              : (data.veoVideoModel ?? 'veo-3'),
    );
  }, [data]);

  const savePref = useMutation({
    mutationFn: (body: { preferredTextProvider?: string; preferredImageProvider?: string; preferredVideoProvider?: string }) =>
      api.patch(`/workspaces/${workspaceId}/ai-credentials/preferences`, body),
    onSuccess: () => {
      toast.success('Preference saved');
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to save'),
  });

  const saveModel = useMutation({
    mutationFn: ({ field, model }: { field: string; model: string }) =>
      api.patch(`/workspaces/${workspaceId}/ai-credentials/${field}/model`, { model }),
    onSuccess: () => {
      toast.success('Model saved');
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to save'),
  });

  if (!data) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">AI defaults</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading…</p></CardContent>
      </Card>
    );
  }

  const captionConfigured = data.anthropic.configured || data.gemini.configured;

  const captionModels = captionProvider === 'claude' ? CLAUDE_MODELS : GEMINI_TEXT_MODELS;
  const imageModels =
    imageProvider === 'openai' ? OPENAI_IMAGE_MODELS
      : imageProvider === 'pollinations' ? POLLINATIONS_IMAGE_MODELS
        : GEMINI_IMAGE_MODELS;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI defaults</CardTitle>
        <CardDescription>
          Pick which engine + model runs each task. Only providers you have a key
          for are selectable — add keys in the cards below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Caption generation */}
        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Caption generation
          </h3>
          {!captionConfigured ? (
            <p className="text-xs text-muted-foreground">
              Add an Anthropic (Claude) or Google (Gemini) key below to enable.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium">Provider</label>
                <select
                  value={captionProvider}
                  onChange={(e) => {
                    const p = e.target.value as 'claude' | 'gemini';
                    setCaptionProvider(p);
                    savePref.mutate({ preferredTextProvider: p });
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="claude" disabled={!data.anthropic.configured}>
                    Claude{!data.anthropic.configured ? ' — no key' : ''}
                  </option>
                  <option value="gemini" disabled={!data.gemini.configured}>
                    Gemini{!data.gemini.configured ? ' — no key' : ''}
                  </option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Model</label>
                <select
                  value={captionModel}
                  onChange={(e) => {
                    const m = e.target.value;
                    setCaptionModel(m);
                    const field = MODEL_FIELD[`caption:${captionProvider}`];
                    if (field) saveModel.mutate({ field, model: m });
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {captionModels.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                  {captionModel && !captionModels.some((m) => m.value === captionModel) && (
                    <option value={captionModel}>{captionModel} (custom)</option>
                  )}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Image generation */}
        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4 text-primary" /> Image generation
          </h3>
          {(
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium">Provider</label>
                <select
                  value={imageProvider}
                  onChange={(e) => {
                    const p = e.target.value as 'openai' | 'gemini' | 'pollinations';
                    setImageProvider(p);
                    savePref.mutate({ preferredImageProvider: p });
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="pollinations">Free — Pollinations (no key)</option>
                  <option value="openai" disabled={!data.openai.configured}>
                    OpenAI{!data.openai.configured ? ' — no key' : ''}
                  </option>
                  <option value="gemini" disabled={!data.gemini.configured}>
                    Gemini{!data.gemini.configured ? ' — no key' : ''}
                  </option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Model</label>
                <select
                  value={imageModel}
                  onChange={(e) => {
                    const m = e.target.value;
                    setImageModel(m);
                    const field = MODEL_FIELD[`image:${imageProvider}`];
                    if (field) saveModel.mutate({ field, model: m });
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {imageModels.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                  {imageModel && !imageModels.some((m) => m.value === imageModel) && (
                    <option value={imageModel}>{imageModel} (custom)</option>
                  )}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Video generation */}
        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clapperboard className="h-4 w-4 text-primary" /> Video generation
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="video-provider" className="text-xs font-medium">Provider</label>
              <select
                id="video-provider"
                value={videoProvider}
                onChange={(e) => {
                  const p = e.target.value as 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo';
                  setVideoProvider(p);
                  savePref.mutate({ preferredVideoProvider: p });
                }}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="demo">Demo — instant sample clip (free)</option>
                <option value="pollinations" disabled={!VIDEO_PROVIDER_READY.pollinations}>
                  Pollinations — free{!VIDEO_PROVIDER_READY.pollinations ? ' (coming soon)' : ''}
                </option>
                <option value="runway" disabled={!VIDEO_PROVIDER_READY.runway}>
                  Runway{!VIDEO_PROVIDER_READY.runway ? ' (coming soon)' : ''}
                </option>
                <option value="kling" disabled={!VIDEO_PROVIDER_READY.kling}>
                  Kling{!VIDEO_PROVIDER_READY.kling ? ' (coming soon)' : ''}
                </option>
                <option value="veo" disabled={!VIDEO_PROVIDER_READY.veo}>
                  Google Veo{!VIDEO_PROVIDER_READY.veo ? ' (coming soon)' : ''}
                </option>
              </select>
            </div>
            <div>
              <label htmlFor="video-model" className="text-xs font-medium">Model</label>
              <select
                id="video-model"
                value={videoModel}
                disabled={videoProvider === 'demo'}
                onChange={(e) => {
                  const m = e.target.value;
                  setVideoModel(m);
                  const field = MODEL_FIELD[`video:${videoProvider}`];
                  if (field) saveModel.mutate({ field, model: m });
                }}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                {(videoProvider === 'demo' ? DEMO_VIDEO_MODELS
                  : videoProvider === 'pollinations' ? POLLINATIONS_VIDEO_MODELS
                    : videoProvider === 'runway' ? RUNWAY_VIDEO_MODELS
                      : videoProvider === 'kling' ? KLING_VIDEO_MODELS
                        : VEO_VIDEO_MODELS
                ).map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Only <strong>Demo</strong> is active in this build — Runway, Kling, Veo and Pollinations video arrive in upcoming updates.
          </p>
        </div>

        {(savePref.isPending || saveModel.isPending) && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
