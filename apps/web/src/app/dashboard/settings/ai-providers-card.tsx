'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProviderState {
  configured: boolean;
  masked: string | null;
  model: string | null;
}

interface AiCredentialsView {
  gemini: ProviderState;
  openai: ProviderState;
  anthropic: ProviderState;
}

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  modelUsed?: string;
  message?: string;
}

type ProviderId = 'gemini' | 'openai' | 'anthropic';

interface ProviderModelOption {
  value: string;
  label: string; // shown in the dropdown
}

interface ProviderMeta {
  id: ProviderId;
  keyField: 'geminiKey' | 'openaiKey' | 'anthropicKey';
  modelField: 'geminiModel' | 'openaiModel' | 'anthropicModel';
  name: string;
  signupUrl: string;
  signupCopy: string;
  keyPlaceholder: string;
  defaultModel: string;
  // Curated dropdown options. Users can also pick "Use default" (empty) to
  // clear their override and follow whatever DEFAULT_MODELS says server-side.
  models: ProviderModelOption[];
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    keyField: 'anthropicKey',
    modelField: 'anthropicModel',
    name: 'Anthropic (Claude)',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    signupCopy: 'Get a key ($5 starter credit)',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { value: 'claude-opus-4-7',   label: 'claude-opus-4-7 — most capable, expensive' },
      { value: 'claude-sonnet-4-7', label: 'claude-sonnet-4-7 — newest balanced' },
      { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 — smart, balanced cost (default)' },
      { value: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5 — previous smart' },
      { value: 'claude-haiku-4-5',  label: 'claude-haiku-4-5 — fastest & cheapest' },
    ],
  },
  {
    id: 'gemini',
    keyField: 'geminiKey',
    modelField: 'geminiModel',
    name: 'Google (Gemini)',
    signupUrl: 'https://aistudio.google.com/apikey',
    signupCopy: 'Get a key (free tier)',
    keyPlaceholder: 'AIzaSy...',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { value: 'gemini-2.5-pro',            label: 'gemini-2.5-pro — best quality, slower' },
      { value: 'gemini-2.5-flash',          label: 'gemini-2.5-flash — fast & free (default)' },
      { value: 'gemini-2.5-flash-lite',     label: 'gemini-2.5-flash-lite — cheapest' },
      { value: 'gemini-2.0-flash',          label: 'gemini-2.0-flash — older free tier' },
      { value: 'gemini-2.0-flash-thinking', label: 'gemini-2.0-flash-thinking — reasoning' },
    ],
  },
  {
    id: 'openai',
    keyField: 'openaiKey',
    modelField: 'openaiModel',
    name: 'OpenAI',
    signupUrl: 'https://platform.openai.com/api-keys',
    signupCopy: 'Get a key ($5 min credit)',
    keyPlaceholder: 'sk-proj-...',
    defaultModel: 'gpt-image-1',
    models: [
      { value: 'gpt-image-1', label: 'gpt-image-1 — image gen, latest (default)' },
      { value: 'dall-e-3',    label: 'dall-e-3 — image gen, older' },
      { value: 'dall-e-2',    label: 'dall-e-2 — image gen, cheapest' },
    ],
  },
];

export function AiProvidersCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [keyDrafts, setKeyDrafts] = useState<Record<ProviderId, string>>({
    gemini: '',
    openai: '',
    anthropic: '',
  });
  const [modelDrafts, setModelDrafts] = useState<Record<ProviderId, string>>({
    gemini: '',
    openai: '',
    anthropic: '',
  });
  const [testResults, setTestResults] = useState<Record<ProviderId, TestResult | null>>({
    gemini: null,
    openai: null,
    anthropic: null,
  });

  const { data } = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () => api.get<AiCredentialsView>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });

  // Seed model drafts with the saved value (or default) whenever data loads
  useEffect(() => {
    if (!data) return;
    setModelDrafts({
      gemini: data.gemini?.model ?? '',
      openai: data.openai?.model ?? '',
      anthropic: data.anthropic?.model ?? '',
    });
  }, [data]);

  const saveKey = useMutation({
    mutationFn: ({ p, key, model }: { p: ProviderMeta; key: string; model?: string }) =>
      api.put<AiCredentialsView>(`/workspaces/${workspaceId}/ai-credentials/${p.keyField}`, {
        key,
        model,
      }),
    onSuccess: (_r, vars) => {
      toast.success(`${vars.p.name} saved`);
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
      setKeyDrafts((d) => ({ ...d, [vars.p.id]: '' }));
      setTestResults((t) => ({ ...t, [vars.p.id]: null }));
    },
    onError: (err: any) => toast.error(err.message ?? 'Save failed'),
  });

  const saveModelOnly = useMutation({
    mutationFn: ({ p, model }: { p: ProviderMeta; model: string }) =>
      api.patch<AiCredentialsView>(
        `/workspaces/${workspaceId}/ai-credentials/${p.modelField}/model`,
        { model },
      ),
    onSuccess: (_r, vars) => {
      toast.success(`${vars.p.name} model updated`);
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Save failed'),
  });

  const deleteKey = useMutation({
    mutationFn: (p: ProviderMeta) =>
      api.delete<AiCredentialsView>(`/workspaces/${workspaceId}/ai-credentials/${p.keyField}`),
    onSuccess: (_r, p) => {
      toast.success(`${p.name} cleared`);
      qc.invalidateQueries({ queryKey: ['ai-credentials', workspaceId] });
      setTestResults((t) => ({ ...t, [p.id]: null }));
    },
    onError: (err: any) => toast.error(err.message),
  });

  const testKey = useMutation({
    mutationFn: (p: ProviderMeta) =>
      api.post<TestResult>(`/workspaces/${workspaceId}/ai-credentials/${p.id}/test`),
    onSuccess: (result, p) => {
      setTestResults((t) => ({ ...t, [p.id]: result }));
      if (result.ok) {
        toast.success(`${p.name} works · ${result.latencyMs}ms`);
      } else {
        toast.error(`${p.name} failed: ${result.message ?? 'unknown error'}`);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI integrations</CardTitle>
        <CardDescription>
          Provide your own API keys for one or more providers. Inboudly tries them in order{' '}
          <strong>Anthropic → Gemini</strong> for text and <strong>OpenAI → Gemini</strong> for
          image; any provider without a key is skipped. Keys are encrypted at rest. You pay your
          AI provider directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PROVIDERS.map((p) => {
          const state = data?.[p.id];
          const keyDraft = keyDrafts[p.id];
          const modelDraft = modelDrafts[p.id];
          const test = testResults[p.id];
          const savingKey = saveKey.isPending && saveKey.variables?.p.id === p.id;
          const savingModel = saveModelOnly.isPending && saveModelOnly.variables?.p.id === p.id;
          const deleting = deleteKey.isPending && deleteKey.variables?.id === p.id;
          const testing = testKey.isPending && testKey.variables?.id === p.id;

          // The "Save" button is enabled if there's a new key draft, OR if the
          // key is configured and the model draft differs from the saved value.
          const modelChanged =
            state?.configured && modelDraft.trim() !== (state.model ?? '');
          const canSaveAll = keyDraft.trim().length >= 10;

          return (
            <div key={p.id} className="rounded-lg border bg-background p-4">
              {/* Header row: provider name + status badge in top-right */}
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="font-medium">{p.name}</h3>
                {state?.configured ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ Configured · key ending in {state.masked?.slice(-4) ?? ''}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not configured</span>
                )}
              </div>

              {/* Inputs row: API key + Model side-by-side */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div>
                  <label className="text-xs font-medium">API key</label>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={state?.configured ? '(unchanged)' : p.keyPlaceholder}
                    value={keyDraft}
                    onChange={(e) =>
                      setKeyDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">Model</label>
                  <select
                    value={modelDraft}
                    onChange={(e) =>
                      setModelDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Use default ({p.defaultModel})</option>
                    {p.models.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                    {/* If the saved value isn't in our curated list, surface it
                        so the dropdown still shows what's actually stored. */}
                    {modelDraft &&
                      !p.models.some((m) => m.value === modelDraft) && (
                        <option value={modelDraft}>{modelDraft} (custom)</option>
                      )}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={(!canSaveAll && !modelChanged) || savingKey || savingModel}
                    onClick={() => {
                      if (canSaveAll) {
                        // Save key + model in one call
                        saveKey.mutate({ p, key: keyDraft, model: modelDraft || undefined });
                      } else if (modelChanged) {
                        saveModelOnly.mutate({ p, model: modelDraft });
                      }
                    }}
                  >
                    {savingKey || savingModel ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                </div>
              </div>

              {/* Action row: Test, Clear + Works indicator + Get a key link */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!state?.configured || testing}
                  onClick={() => testKey.mutate(p)}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Testing
                    </>
                  ) : (
                    'Test'
                  )}
                </Button>

                {state?.configured && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deleting}
                    onClick={() => deleteKey.mutate(p)}
                  >
                    {deleting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Clear'
                    )}
                  </Button>
                )}

                {test &&
                  (test.ok ? (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"
                      title={`${test.modelUsed} · ${test.latencyMs}ms · ${test.message ?? ''}`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Works
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
                      title={test.message ?? 'Unknown error'}
                    >
                      <XCircle className="h-3 w-3" />
                      Failed
                    </span>
                  ))}

                <span className="ml-auto">
                  <a
                    href={p.signupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {p.signupCopy}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </span>
              </div>

              {/* Failure detail (shown inline so the toast isn't the only place to see it) */}
              {test && !test.ok && (
                <p className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-300">
                  {test.message}
                </p>
              )}
              {!test && state?.configured && state.model && state.model !== p.defaultModel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Active model: <span className="font-mono">{state.model}</span>
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
