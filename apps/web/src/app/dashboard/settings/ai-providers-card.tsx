'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, Loader2, XCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProviderState {
  configured: boolean;
  masked: string | null;
  model: string | null;
}

// Key-only providers don't have a model concept.
interface KeyOnlyState {
  configured: boolean;
  masked: string | null;
}

interface AiCredentialsView {
  gemini: ProviderState;
  higgsfield: KeyOnlyState;
}

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  modelUsed?: string;
  message?: string;
}

type ProviderId = 'gemini' | 'higgsfield';

interface ProviderModelOption {
  value: string;
  label: string;
}

interface ProviderMeta {
  id: ProviderId;
  keyField: 'geminiKey' | 'higgsfieldKey';
  // Key-only providers omit modelField / defaultModel / models.
  modelField?: 'geminiModel';
  name: string;
  signupUrl: string;
  signupCopy: string;
  keyPlaceholder: string;
  defaultModel?: string;
  models?: ProviderModelOption[];
  // Set true to hide the Test button (no test endpoint for this provider).
  noTest?: boolean;
  // Optional one-line helper text shown under the key input.
  helpText?: string;
}

const PROVIDERS: ProviderMeta[] = [
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
    id: 'higgsfield',
    keyField: 'higgsfieldKey',
    name: 'Higgsfield (video)',
    signupUrl: 'https://cloud.higgsfield.ai',
    signupCopy: 'Get key + secret',
    keyPlaceholder: 'api_key:api_key_secret',
    noTest: true,
    helpText:
      'Cinematic video. Paste your key + secret from cloud.higgsfield.ai joined as api_key:api_key_secret. Pay-as-you-go; Inboudly never bills you.',
  },
];

/** Derive the category tag label from provider id. */
function categoryTag(id: ProviderId): string {
  if (id === 'gemini') return 'Text + Image';
  return 'Video';
}

export function AiProvidersCard({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [keyDrafts, setKeyDrafts] = useState<Record<ProviderId, string>>({
    gemini: '',
    higgsfield: '',
  });
  const [modelDrafts, setModelDrafts] = useState<Record<ProviderId, string>>({
    gemini: '',
    higgsfield: '', // unused — key-only
  });
  const [testResults, setTestResults] = useState<Record<ProviderId, TestResult | null>>({
    gemini: null,
    higgsfield: null,
  });

  // Explicit toggle overrides per provider. Absent = use default-open rule.
  const [open, setOpen] = useState<Record<ProviderId, boolean>>({} as Record<ProviderId, boolean>);

  const { data } = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () => api.get<AiCredentialsView>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });

  // Seed model drafts with the saved value (or default) whenever data loads.
  useEffect(() => {
    if (!data) return;
    setModelDrafts({
      gemini: data.gemini?.model ?? '',
      higgsfield: '',
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
          Provide your own API keys. <strong>Gemini</strong> powers text and image generation;{' '}
          <strong>Higgsfield</strong> powers cinematic video. Keys are encrypted at rest. You pay
          each AI provider directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
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
          // Key-only providers (no p.models) never have a "model changed" state.
          const hasModels = !!p.models?.length;
          const stateModel =
            hasModels && state && 'model' in state ? (state as ProviderState).model : null;
          const modelChanged =
            hasModels && state?.configured && modelDraft.trim() !== (stateModel ?? '');
          const canSaveAll = keyDraft.trim().length >= 10;

          // Default-open rule: open when NOT configured (so first-time setup is
          // immediately visible). Explicit toggle in `open` overrides this.
          const effectiveOpen = open[p.id] ?? !state?.configured;

          const toggleOpen = () =>
            setOpen((prev) => ({ ...prev, [p.id]: !effectiveOpen }));

          return (
            <div key={p.id} className="rounded-lg border bg-background overflow-hidden">
              {/* Summary header — always visible, clickable to toggle */}
              <button
                type="button"
                onClick={toggleOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={effectiveOpen}
              >
                {/* Category tag */}
                <span className="shrink-0 rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {categoryTag(p.id)}
                </span>

                {/* Provider name */}
                <span className="font-medium text-sm">{p.name}</span>

                {/* Status — pushed to the right */}
                <span className="ml-auto flex items-center gap-2">
                  {state?.configured ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Configured · ····{state.masked?.slice(-4) ?? ''}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not configured</span>
                  )}
                </span>

                {/* Chevron — rotates 90° when expanded */}
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    effectiveOpen ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {/* Expanded body */}
              {effectiveOpen && (
                <div className="border-t bg-muted/20 px-4 pb-4 pt-3">
                  {/* Inputs row — 3 cols (key + model + save) for full providers,
                      2 cols (key + save) for key-only like Higgsfield. */}
                  <div
                    className={`grid grid-cols-1 gap-3 ${
                      hasModels ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-[1fr_auto]'
                    }`}
                  >
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
                      {p.helpText && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{p.helpText}</p>
                      )}
                    </div>
                    {hasModels && (
                      <div>
                        <label className="text-xs font-medium">Model</label>
                        <div className="relative mt-1">
                          <select
                            value={modelDraft}
                            onChange={(e) =>
                              setModelDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                            }
                            className="w-full appearance-none rounded-md border bg-background py-2 pl-3 pr-8 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Use default ({p.defaultModel})</option>
                            {p.models!.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                            {/* If the saved value isn't in our curated list, surface
                                it so the dropdown still shows what's actually stored. */}
                            {modelDraft &&
                              !p.models!.some((m) => m.value === modelDraft) && (
                                <option value={modelDraft}>{modelDraft} (custom)</option>
                              )}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        </div>
                      </div>
                    )}
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
                    {!p.noTest && (
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
                    )}

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
                  {!test && state?.configured && hasModels && stateModel && stateModel !== p.defaultModel && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Active model: <span className="font-mono">{stateModel}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
