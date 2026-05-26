'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Compass, Sparkles, Loader2, TrendingUp, DollarSign, AlertTriangle,
  Lightbulb, Layers, ArrowRight, RefreshCw, Trash2,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Platform = 'INSTAGRAM' | 'TIKTOK' | 'REDNOTE' | 'FACEBOOK' | 'LINKEDIN' | 'YOUTUBE';

interface RpmBreakdown {
  ads: { min: number; max: number };
  brandDeals: { min: number; max: number };
  affiliate: { min: number; max: number };
  products: { min: number; max: number };
}

interface AdjacentNiche {
  niche: string;
  reason: string;
  monetizationDelta: 'much higher' | 'higher' | 'similar' | 'lower' | 'much lower';
  audienceOverlap: 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'moderate' | 'hard';
}

interface NicheAnalysisResult {
  ok: boolean;
  cached: boolean;
  niche: string;
  platform: Platform | null;
  rpm: { min: number; max: number; breakdown: RpmBreakdown } | null;
  scores: {
    saturation: number;
    growth: number;
    monetizationDifficulty: number;
    overall: number;
  } | null;
  summary: string;
  opportunities: string[];
  threats: string[];
  topFormats: string[];
  adjacentNiches: AdjacentNiche[];
  modelUsed?: string;
  analyzedAt?: string;
  message?: string;
}

interface NicheHistoryRow {
  id: string;
  niche: string;
  platform: Platform | null;
  overallScore: number | null;
  analyzedAt: string;
}

const PLATFORM_LABEL: Record<Platform | 'ALL', string> = {
  ALL: 'All platforms',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  REDNOTE: '小红书 RedNote',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
};

function ScoreGauge({ label, score, invertColor = false }: {
  label: string;
  score: number;
  /** When true, LOW score = green (e.g. saturation, difficulty). */
  invertColor?: boolean;
}) {
  const isGood = invertColor ? score < 40 : score >= 60;
  const isMid = invertColor ? score < 70 : score >= 30;
  const color = isGood ? 'bg-emerald-500' : isMid ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <strong className="font-mono">{score}/100</strong>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const DELTA_META: Record<AdjacentNiche['monetizationDelta'], { label: string; color: string }> = {
  'much higher': { label: '↑↑ much higher $', color: 'text-emerald-600 dark:text-emerald-400' },
  higher:        { label: '↑ higher $',        color: 'text-emerald-600 dark:text-emerald-400' },
  similar:       { label: '≈ similar $',       color: 'text-muted-foreground' },
  lower:         { label: '↓ lower $',         color: 'text-amber-600 dark:text-amber-400' },
  'much lower':  { label: '↓↓ much lower $',   color: 'text-red-600 dark:text-red-400' },
};

export default function NichesPage() {
  const qc = useQueryClient();
  const [nicheInput, setNicheInput] = useState('');
  const [platform, setPlatform] = useState<Platform | 'ALL'>('ALL');
  const [result, setResult] = useState<NicheAnalysisResult | null>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  const history = useQuery({
    queryKey: ['niches', workspaceId],
    queryFn: () => api.get<NicheHistoryRow[]>(`/niches?workspaceId=${workspaceId}&limit=20`),
    enabled: !!workspaceId,
  });

  const analyze = useMutation({
    mutationFn: (force = false) =>
      api.post<NicheAnalysisResult>('/niches/analyze', {
        workspaceId,
        niche: nicheInput,
        platform: platform === 'ALL' ? null : platform,
        force,
      }),
    onSuccess: (r) => {
      setResult(r);
      if (r.ok) {
        const src = r.cached ? 'cached' : `via ${r.modelUsed ?? 'AI'}`;
        toast.success(`Analysed "${r.niche}" (${src})`);
        qc.invalidateQueries({ queryKey: ['niches', workspaceId] });
      } else {
        toast.error(r.message ?? 'Analysis failed');
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteOne = useMutation({
    mutationFn: (id: string) => api.delete(`/niches/${id}?workspaceId=${workspaceId}`),
    onSuccess: () => {
      toast.success('Removed');
      qc.invalidateQueries({ queryKey: ['niches', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const loadHistoryRow = async (row: NicheHistoryRow) => {
    setNicheInput(row.niche);
    setPlatform(row.platform ?? 'ALL');
    // Fetch the full cached analysis (re-uses the analyze endpoint without force)
    const r = await api.post<NicheAnalysisResult>('/niches/analyze', {
      workspaceId,
      niche: row.niche,
      platform: row.platform,
      force: false,
    });
    setResult(r);
  };

  const analyzeAdjacent = (niche: string) => {
    setNicheInput(niche);
    setResult(null);
    // Auto-trigger analysis with current platform selection
    setTimeout(() => analyze.mutate(false), 50);
  };

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Compass className="h-7 w-7 text-primary" />
            Niche Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Analyse any niche's RPM potential, market saturation, monetization
            difficulty, and adjacent opportunities. Cached 7 days per niche.
          </p>
        </div>
        <Badge variant="info" className="text-xs shrink-0">Phase 2A.4 · Beta</Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: input + history */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Analyse a niche</CardTitle>
              <CardDescription>
                Free text. e.g. "vegan baking", "indie hacker tools", "luxury travel".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium">Niche</label>
                <input
                  type="text"
                  value={nicheInput}
                  onChange={(e) => setNicheInput(e.target.value)}
                  placeholder="e.g. vegan baking"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && nicheInput.trim()) analyze.mutate(false);
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium">Platform (optional)</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as Platform | 'ALL')}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {(['ALL', 'INSTAGRAM', 'TIKTOK', 'REDNOTE', 'YOUTUBE', 'LINKEDIN', 'FACEBOOK'] as const).map((p) => (
                    <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => analyze.mutate(false)}
                  disabled={!nicheInput.trim() || analyze.isPending || !workspaceId}
                  className="flex-1"
                >
                  {analyze.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analyzing</>
                  ) : (
                    <><Sparkles className="mr-2 h-4 w-4" />Analyse</>
                  )}
                </Button>
                {result?.ok && (
                  <Button
                    variant="outline"
                    size="sm"
                    title="Re-run analysis (ignores cache)"
                    onClick={() => analyze.mutate(true)}
                    disabled={analyze.isPending}
                  >
                    <RefreshCw className={`h-4 w-4 ${analyze.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Uses your BYOK text AI. First call ~10-20 sec; cached for 7 days.
              </p>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent analyses</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (history.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No analyses yet.</p>
              ) : (
                <ul className="space-y-1">
                  {history.data!.map((row) => (
                    <li key={row.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => loadHistoryRow(row)}
                        className="flex-1 truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                      >
                        <strong>{row.niche}</strong>
                        {row.platform && <span className="text-muted-foreground"> · {row.platform}</span>}
                        {row.overallScore !== null && (
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {row.overallScore}/100
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete cached analysis for "${row.niche}"?`)) {
                            deleteOne.mutate(row.id);
                          }
                        }}
                        className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover:flex"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: results */}
        <div className="lg:col-span-2">
          {!result && !analyze.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <Compass className="mb-3 h-12 w-12 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                  Enter a niche on the left and click <strong>Analyse</strong> to see RPM,
                  saturation, opportunities, and adjacent niches.
                </p>
              </CardContent>
            </Card>
          )}

          {analyze.isPending && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <Loader2 className="mb-3 h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Analyzing "{nicheInput}"… ~10-20 sec
                </p>
              </CardContent>
            </Card>
          )}

          {result && !result.ok && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="rounded bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                  {result.message}
                </p>
              </CardContent>
            </Card>
          )}

          {result?.ok && (
            <div className="space-y-4">
              {/* Header card */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-xl capitalize">{result.niche}</CardTitle>
                      <CardDescription>
                        {PLATFORM_LABEL[result.platform ?? 'ALL']}
                        {result.cached && ' · cached'}
                        {result.modelUsed && ` · ${result.modelUsed}`}
                      </CardDescription>
                    </div>
                    {result.scores && (
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">{result.scores.overall}</div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">overall</div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{result.summary}</p>
                </CardContent>
              </Card>

              {/* RPM Calculator + Scores side-by-side */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {result.rpm && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <DollarSign className="h-4 w-4 text-emerald-500" />
                        RPM estimate (per 1,000 views)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 text-2xl font-bold">
                        ${result.rpm.min.toFixed(2)} – ${result.rpm.max.toFixed(2)}
                      </div>
                      <div className="space-y-2">
                        {Object.entries(result.rpm.breakdown).map(([source, range]) => (
                          <div key={source} className="flex items-center justify-between text-xs">
                            <span className="capitalize text-muted-foreground">
                              {source.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                            <span className="font-mono">
                              ${range.min.toFixed(2)} – ${range.max.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {result.scores && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Health scores
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ScoreGauge label="Growth (higher better)" score={result.scores.growth} />
                      <ScoreGauge label="Saturation (lower better)" score={result.scores.saturation} invertColor />
                      <ScoreGauge label="Monetization difficulty (lower better)" score={result.scores.monetizationDifficulty} invertColor />
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Opportunities + Threats */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Lightbulb className="h-4 w-4 text-emerald-500" />
                      Opportunities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {result.opportunities.map((o, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-emerald-500">▸</span>
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Threats
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {result.threats.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-amber-500">▸</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* Top formats */}
              {result.topFormats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Layers className="h-4 w-4 text-primary" />
                      Top-performing formats
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.topFormats.map((f) => (
                        <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Adjacent niches */}
              {result.adjacentNiches.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Adjacent niches to explore</CardTitle>
                    <CardDescription>
                      Niches with overlapping audiences. Click to analyse.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {result.adjacentNiches.map((a, i) => {
                        const delta = DELTA_META[a.monetizationDelta];
                        return (
                          <button
                            key={i}
                            onClick={() => analyzeAdjacent(a.niche)}
                            className="group flex w-full items-start justify-between gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary hover:shadow-sm"
                          >
                            <div className="flex-1">
                              <div className="font-medium">{a.niche}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{a.reason}</div>
                              <div className="mt-2 flex gap-2 text-[10px]">
                                <span className={`font-medium ${delta.color}`}>{delta.label}</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">{a.audienceOverlap} overlap</span>
                                <span className="text-muted-foreground">·</span>
                                <span className="text-muted-foreground">{a.difficulty}</span>
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
