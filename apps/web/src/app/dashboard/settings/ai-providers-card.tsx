'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ExternalLink, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AiCredentialsView {
  gemini: { configured: boolean; masked: string | null };
  openai: { configured: boolean; masked: string | null };
  anthropic: { configured: boolean; masked: string | null };
  preferredTextProvider: 'claude' | 'gemini' | null;
  preferredImageProvider: 'openai' | 'gemini' | null;
}

type ProviderId = 'gemini' | 'openai' | 'anthropic';

interface ProviderMeta {
  id: ProviderId;
  field: 'geminiKey' | 'openaiKey' | 'anthropicKey';
  name: string;
  description: string;
  signupUrl: string;
  freeTier: string;
  keyPrefix: string;
  badge: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'gemini',
    field: 'geminiKey',
    name: 'Google Gemini',
    description: 'Generous free tier for text generation. Image gen requires paid GCP billing.',
    signupUrl: 'https://aistudio.google.com/apikey',
    freeTier: 'Free tier available',
    keyPrefix: 'AIzaSy…',
    badge: 'free',
  },
  {
    id: 'openai',
    field: 'openaiKey',
    name: 'OpenAI',
    description: 'GPT Image 2.0 (~$0.04/image), Whisper transcription, embeddings.',
    signupUrl: 'https://platform.openai.com/api-keys',
    freeTier: '$5 min credit',
    keyPrefix: 'sk-proj-…',
    badge: 'paid',
  },
  {
    id: 'anthropic',
    field: 'anthropicKey',
    name: 'Anthropic (Claude)',
    description: 'Claude Sonnet 4.6 — highest quality for captions and clip selection.',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    freeTier: '$5 starter credit',
    keyPrefix: 'sk-ant-…',
    badge: 'paid',
  },
];

export function AiProvidersCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<ProviderId, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
  });
  const [drafts, setDrafts] = useState<Record<ProviderId, string>>({
    gemini: '',
    openai: '',
    anthropic: '',
  });
  const [show, setShow] = useState<Record<ProviderId, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () =>
      api.get<AiCredentialsView>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });

  const saveKey = useMutation({
    mutationFn: ({ provider, key }: { provider: ProviderMeta; key: string }) =>
      api.put<AiCredentialsView>(
        `/workspaces/${workspaceId}/ai-credentials/${provider.field}`,
        { key },
      ),
    onSuccess: (_resp, vars) => {
      toast.success(`${vars.provider.name} key saved`);
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
      setEditing((p) => ({ ...p, [vars.provider.id]: false }));
      setDrafts((p) => ({ ...p, [vars.provider.id]: '' }));
    },
    onError: (err: any) => toast.error(err.message ?? 'Save failed'),
  });

  const deleteKey = useMutation({
    mutationFn: (provider: ProviderMeta) =>
      api.delete<AiCredentialsView>(
        `/workspaces/${workspaceId}/ai-credentials/${provider.field}`,
      ),
    onSuccess: (_resp, provider) => {
      toast.success(`${provider.name} key removed`);
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Delete failed'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Providers</CardTitle>
        <CardDescription>
          Inboudly uses <strong>your own AI API keys</strong>. You pay your AI providers directly —
          we never bill you for AI usage. Keys are encrypted at rest with AES-256.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!isLoading &&
          PROVIDERS.map((provider) => {
            const state = data?.[provider.id];
            const isEditing = editing[provider.id];
            const draft = drafts[provider.id];
            const isSaving = saveKey.isPending && saveKey.variables?.provider.id === provider.id;
            const isDeleting = deleteKey.isPending && deleteKey.variables?.id === provider.id;

            return (
              <div
                key={provider.id}
                className="rounded-lg border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{provider.name}</h3>
                      <Badge variant={provider.badge === 'free' ? 'success' : 'secondary'}>
                        {provider.badge}
                      </Badge>
                      {state?.configured && (
                        <Badge variant="info">
                          <Check className="mr-1 h-3 w-3" />
                          configured
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {provider.description}
                    </p>
                    <a
                      href={provider.signupUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Get a key ({provider.freeTier})
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {state?.configured && !isEditing && (
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-secondary px-2 py-1 text-xs">
                        {state.masked}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing((p) => ({ ...p, [provider.id]: true }))}
                      >
                        Replace
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={isDeleting}
                        onClick={() => deleteKey.mutate(provider)}
                        title="Remove key"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {(isEditing || !state?.configured) && (
                  <div className="mt-3 space-y-2">
                    <label className="text-xs font-medium">API key</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={show[provider.id] ? 'text' : 'password'}
                          value={draft}
                          onChange={(e) =>
                            setDrafts((p) => ({ ...p, [provider.id]: e.target.value }))
                          }
                          placeholder={provider.keyPrefix}
                          className="w-full rounded-md border bg-background px-3 py-2 pr-10 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShow((p) => ({ ...p, [provider.id]: !p[provider.id] }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Toggle visibility"
                        >
                          {show[provider.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <Button
                        disabled={!draft.trim() || isSaving}
                        onClick={() => saveKey.mutate({ provider, key: draft })}
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      {isEditing && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditing((p) => ({ ...p, [provider.id]: false }));
                            setDrafts((p) => ({ ...p, [provider.id]: '' }));
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        <div className="rounded-md border border-dashed bg-secondary/30 p-3 text-xs text-muted-foreground">
          💡 <strong>How to choose:</strong> For free testing, start with <strong>Gemini</strong>{' '}
          (free tier covers text generation). Add <strong>OpenAI</strong> when you want image
          generation. Add <strong>Anthropic</strong> for highest-quality captions and the
          repurpose engine's clip selection.
        </div>
      </CardContent>
    </Card>
  );
}
