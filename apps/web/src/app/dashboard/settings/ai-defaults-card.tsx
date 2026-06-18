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
  geminiImageModel: string | null;
  higgsfield: { configured: boolean } | null;
}

type ModelOption = { value: string; label: string };

const GEMINI_TEXT_MODELS: ModelOption[] = [
  { value: 'gemini-2.5-pro',            label: 'gemini-2.5-pro — best quality' },
  { value: 'gemini-2.5-flash',          label: 'gemini-2.5-flash — fast & free (default)' },
  { value: 'gemini-2.5-flash-lite',     label: 'gemini-2.5-flash-lite — cheapest' },
  { value: 'gemini-2.0-flash',          label: 'gemini-2.0-flash — older' },
  { value: 'gemini-2.0-flash-thinking', label: 'gemini-2.0-flash-thinking — reasoning' },
];

const GEMINI_IMAGE_MODELS: ModelOption[] = [
  { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image — Nano Banana (default)' },
];

export function AiDefaultsCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () => api.get<CredsView>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });

  // Local state mirrors the server but updates instantly on change.
  const [captionModel, setCaptionModel] = useState('');
  const [imageModel, setImageModel] = useState('');

  useEffect(() => {
    if (!data) return;
    setCaptionModel(data.gemini.model ?? 'gemini-2.5-flash');
    setImageModel(data.geminiImageModel ?? 'gemini-2.5-flash-image');
  }, [data]);

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

  const geminiConfigured = data.gemini.configured;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI defaults</CardTitle>
        <CardDescription>
          Pick which model runs each task. Add keys in AI Providers below to enable each section.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Caption generation */}
        <div className="rounded-lg border bg-background p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> Caption generation
          </h3>
          {!geminiConfigured ? (
            <p className="text-xs text-muted-foreground">
              Add a Google (Gemini) key in AI Providers below to enable.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium">Engine</label>
                <p className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Gemini
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Model</label>
                <select
                  value={captionModel}
                  onChange={(e) => {
                    const m = e.target.value;
                    setCaptionModel(m);
                    saveModel.mutate({ field: 'geminiModel', model: m });
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {GEMINI_TEXT_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                  {captionModel && !GEMINI_TEXT_MODELS.some((m) => m.value === captionModel) && (
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
          {!geminiConfigured ? (
            <p className="text-xs text-muted-foreground">
              Add a Google (Gemini) key in AI Providers below to enable.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium">Engine</label>
                <p className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  Gemini
                </p>
              </div>
              <div>
                <label className="text-xs font-medium">Model</label>
                <select
                  value={imageModel}
                  onChange={(e) => {
                    const m = e.target.value;
                    setImageModel(m);
                    saveModel.mutate({ field: 'geminiImageModel', model: m });
                  }}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {GEMINI_IMAGE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                  {imageModel && !GEMINI_IMAGE_MODELS.some((m) => m.value === imageModel) && (
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
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Higgsfield</span>
            {data.higgsfield?.configured ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                Enabled
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Add a Higgsfield key in AI Providers below to enable video.
              </span>
            )}
          </div>
        </div>

        {saveModel.isPending && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
