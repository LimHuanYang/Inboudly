'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';

interface VideoJobResponse {
  id: string;
  status: 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
  mediaAsset?: { id: string; url: string };
  errorMessage?: string;
}
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clapperboard, Film, ImageIcon, Info, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { PLATFORM_SPECS, type SocialPlatform } from '@inboudly/shared/platforms';
import { type ViralityScoreResponse } from '@inboudly/shared/schemas';

const PHASE_1_PLATFORMS: SocialPlatform[] = ['INSTAGRAM', 'TIKTOK', 'REDNOTE'];

export default function ComposerPage() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['INSTAGRAM']);
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>('INSTAGRAM');
  const [captions, setCaptions] = useState<Record<SocialPlatform, string>>({
    INSTAGRAM: '',
    TIKTOK: '',
    REDNOTE: '',
  } as Record<SocialPlatform, string>);
  const [hashtags, setHashtags] = useState<Record<SocialPlatform, string>>({
    INSTAGRAM: '',
    TIKTOK: '',
    REDNOTE: '',
  } as Record<SocialPlatform, string>);
  const [aiPrompt, setAiPrompt] = useState('');

  // ----- Image generation state -----
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageAspect, setImageAspect] = useState<'1:1' | '4:5' | '9:16' | '16:9'>('1:1');
  const [imageCount, setImageCount] = useState(1);
  const [generatedImages, setGeneratedImages] = useState<
    Array<{ id: string; url: string; prompt: string }>
  >([]);
  const [attachedImageIds, setAttachedImageIds] = useState<Record<SocialPlatform, string[]>>({
    INSTAGRAM: [],
    TIKTOK: [],
    REDNOTE: [],
  } as unknown as Record<SocialPlatform, string[]>);
  // Resolved {url,type} for each attached asset id, so the "Attached media"
  // strip can render thumbnails. Populated at attach time (image + video).
  const [attachedAssets, setAttachedAssets] = useState<
    Record<string, { url: string; type: 'image' | 'video' }>
  >({});

  // ----- Video generation state -----
  const [mediaMode, setMediaMode] = useState<'image' | 'video'>('image');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspect, setVideoAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);

  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<any>('/auth/me'),
  });
  const workspaceId = me.data?.memberships?.[0]?.workspace?.id;

  // Trend Radar deep-link: ?trendId=… on this URL means the user clicked
  // "Use in Composer" on a trend card. Fetch the prefilled prompt once
  // (workspace-scoped), then apply it to the AI prompt / platform / hashtags.
  // Guarded with a ref so React's strict-mode double-render doesn't double-apply.
  const searchParams = useSearchParams();
  const trendId = searchParams.get('trendId');
  const appliedTrendRef = useRef<string | null>(null);
  useEffect(() => {
    if (!trendId || !workspaceId || appliedTrendRef.current === trendId) return;
    appliedTrendRef.current = trendId;
    api
      .get<{ platform: SocialPlatform; prompt: string; hashtags: string[] }>(
        `/trends/${trendId}/composer-prompt?workspaceId=${workspaceId}`,
      )
      .then((data) => {
        setAiPrompt(data.prompt);
        setSelectedPlatforms([data.platform]);
        setActivePlatform(data.platform);
        if (data.hashtags.length) {
          setHashtags((prev) => ({
            ...prev,
            [data.platform]: data.hashtags.map((h) => `#${h}`).join(' '),
          }));
        }
        toast.success(`Loaded trend into Composer for ${data.platform}`);
      })
      .catch((err) => toast.error(`Couldn't load trend: ${err.message}`));
  }, [trendId, workspaceId]);

  const generateImage = useMutation({
    mutationFn: (input: { prompt: string; aspectRatio: string; count: number }) =>
      api.post<{ assets: Array<{ id: string; url: string }> }>('/ai/image', {
        workspaceId,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        count: input.count,
      }),
    onSuccess: (data, vars) => {
      const newImages = (data.assets ?? []).map((a) => ({
        id: a.id,
        url: a.url,
        prompt: vars.prompt,
      }));
      setGeneratedImages((prev) => [...newImages, ...prev]);
      toast.success(`Generated ${newImages.length} image${newImages.length === 1 ? '' : 's'}`);
    },
    onError: (err: any) =>
      toast.error("Couldn't generate image", {
        description: err?.message ?? 'Something went wrong. Please try again in a moment.',
        duration: 8000,
      }),
  });

  const generateVideo = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/ai/video', {
        workspaceId,
        prompt: videoPrompt,
        aspectRatio: videoAspect,
        durationSec: videoDuration,
      }),
    onSuccess: (job) => {
      setVideoJobId(job.id);
      qc.invalidateQueries({ queryKey: ['video-jobs', workspaceId] });
    },
    onError: (err: any) =>
      toast.error("Couldn't start video", {
        description: err?.message ?? 'Please try again.',
        duration: 8000,
      }),
  });

  const videoStatus = useQuery<VideoJobResponse>({
    queryKey: ['video-job', videoJobId],
    queryFn: () => api.get<VideoJobResponse>(`/ai/video/${videoJobId}?workspaceId=${workspaceId}`),
    enabled: !!videoJobId && !!workspaceId && mediaMode === 'video',
    // TanStack Query v5: callback receives the query object.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'GENERATING' || s === 'PENDING' ? 2500 : false;
    },
    // Keep polling on a backgrounded tab so the result resolves even if the
    // user switched away mid-generation.
    refetchIntervalInBackground: true,
  });

  const toggleAttachImage = (imageId: string) => {
    setAttachedImageIds((prev) => {
      const current = prev[activePlatform] ?? [];
      const next = current.includes(imageId)
        ? current.filter((id) => id !== imageId)
        : [...current, imageId];
      return { ...prev, [activePlatform]: next };
    });
    const img = generatedImages.find((g) => g.id === imageId);
    if (img) setAttachedAssets((m) => ({ ...m, [imageId]: { url: img.url, type: 'image' } }));
  };

  // Remove any attached asset (image or video) from the active platform's post.
  const removeAttached = (id: string) => {
    setAttachedImageIds((prev) => ({
      ...prev,
      [activePlatform]: (prev[activePlatform] ?? []).filter((x) => x !== id),
    }));
  };

  // Attached assets for the active platform, resolved to {id,url,type} for the strip.
  const attachedForActive = (attachedImageIds[activePlatform] ?? [])
    .map((id) => ({ id, ...attachedAssets[id] }))
    .filter((a): a is { id: string; url: string; type: 'image' | 'video' } => Boolean(a.url));

  const generateText = useMutation({
    mutationFn: (input: { platform: SocialPlatform; prompt: string }) =>
      api.post<any>('/ai/text', {
        workspaceId,
        platform: input.platform,
        prompt: input.prompt,
        language: input.platform === 'REDNOTE' ? 'zh-CN' : 'en',
        variations: 1,
      }),
    onSuccess: (data, vars) => {
      const v = data.variants?.[0];
      if (v) {
        setCaptions((prev) => ({ ...prev, [vars.platform]: v.caption }));
        setHashtags((prev) => ({ ...prev, [vars.platform]: (v.hashtags ?? []).join(' ') }));
        // The AI also drafts a matching image-generation prompt. Pre-fill the
        // "Generate image with AI" box so the user can produce on-brand
        // imagery in one click — especially valuable for image-first RedNote.
        if (v.imagePrompt && typeof v.imagePrompt === 'string') {
          setImagePrompt(v.imagePrompt);
        }
      }
      toast.success(
        v?.imagePrompt
          ? `Generated ${vars.platform} caption + image prompt`
          : `Generated ${vars.platform} caption`,
      );
    },
    onError: (err: any) => toast.error(err.message),
  });

  const variantsForScoring = useMemo(
    () =>
      selectedPlatforms.map((p) => ({
        platform: p,
        caption: captions[p] ?? '',
        hashtags: (hashtags[p] ?? '')
          .split(/\s+/)
          .filter((h) => h.startsWith('#'))
          .map((h) => h.slice(1)),
        language: p === 'REDNOTE' ? 'zh-CN' : 'en',
        hasImage: (attachedImageIds[p] ?? []).length > 0,
        hasVideo: false,
      })),
    [selectedPlatforms, captions, hashtags, attachedImageIds],
  );

  const score = useQuery({
    queryKey: ['virality', variantsForScoring],
    queryFn: () =>
      api.post<ViralityScoreResponse>('/intelligence/virality-score', {
        variants: variantsForScoring,
      }),
    enabled: variantsForScoring.some((v) => v.caption.length > 10),
  });

  const togglePlatform = (p: SocialPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const activeScore = score.data?.perPlatform.find((p) => p.platform === activePlatform);

  // BYOK: warn the user if no AI keys are configured for this workspace
  const aiCredentials = useQuery({
    queryKey: ['ai-credentials', workspaceId],
    queryFn: () => api.get<any>(`/workspaces/${workspaceId}/ai-credentials`),
    enabled: !!workspaceId,
  });
  const hasAnyTextKey =
    aiCredentials.data?.anthropic?.configured || aiCredentials.data?.gemini?.configured;
  const hasAnyImageKey =
    aiCredentials.data?.openai?.configured || aiCredentials.data?.gemini?.configured;

  return (
    <div className="container py-8">
      <h1 className="mb-2 text-3xl font-bold">Composer</h1>
      <p className="mb-4 text-muted-foreground">
        Write once, optimize for every platform with AI.
      </p>

      {/* BYOK banner — only shown if no AI provider key configured */}
      {workspaceId && !aiCredentials.isLoading && !hasAnyTextKey && !hasAnyImageKey && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-900 dark:text-amber-200">
                Add your AI keys to start generating
              </h3>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                Inboudly uses your own AI provider API keys — you pay your provider directly.
                Get a <strong>free Gemini key</strong> in 2 minutes to begin.
              </p>
              <Button asChild className="mt-3" size="sm">
                <a href="/dashboard/settings">Open Settings → AI Providers</a>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Platform tabs + composer */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platforms</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {PHASE_1_PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    selectedPlatforms.includes(p)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-secondary'
                  }`}
                >
                  {PLATFORM_SPECS[p].displayName}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{PLATFORM_SPECS[activePlatform].displayName}</CardTitle>
              <div className="flex gap-1">
                {selectedPlatforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => setActivePlatform(p)}
                    className={`rounded px-2 py-1 text-xs ${
                      activePlatform === p ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                    }`}
                  >
                    {p[0]}
                    {p[1]?.toLowerCase()}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Caption</label>
                <textarea
                  rows={8}
                  value={captions[activePlatform] ?? ''}
                  onChange={(e) =>
                    setCaptions((prev) => ({ ...prev, [activePlatform]: e.target.value }))
                  }
                  placeholder={`Write your ${activePlatform.toLowerCase()} caption…`}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {(captions[activePlatform] ?? '').length} /{' '}
                    {PLATFORM_SPECS[activePlatform].maxCaptionLength}
                  </span>
                  <span>
                    sweet spot: {PLATFORM_SPECS[activePlatform].optimalCaptionLength.min}-
                    {PLATFORM_SPECS[activePlatform].optimalCaptionLength.max}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Hashtags</label>
                <input
                  value={hashtags[activePlatform] ?? ''}
                  onChange={(e) =>
                    setHashtags((prev) => ({ ...prev, [activePlatform]: e.target.value }))
                  }
                  placeholder="#hashtag #another"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Optimal: {PLATFORM_SPECS[activePlatform].optimalHashtags} hashtags
                </p>
              </div>

              {/* Attached media for this platform's post */}
              <div>
                <label className="text-sm font-medium">
                  Attached media{attachedForActive.length > 0 ? ` (${attachedForActive.length})` : ''}
                </label>
                {attachedForActive.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nothing attached yet — generate or pick media below, then click Attach.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {attachedForActive.map((a) => (
                      <li key={a.id} className="relative">
                        {a.type === 'video' ? (
                          <span className="block">
                            <video
                              src={a.url}
                              muted
                              preload="metadata"
                              aria-label="Attached video"
                              className="h-16 w-16 rounded-md border bg-black object-cover"
                            />
                            <Film
                              className="pointer-events-none absolute bottom-1 left-1 h-3.5 w-3.5 text-white drop-shadow"
                              aria-hidden="true"
                            />
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.url}
                            alt="Attached image"
                            className="h-16 w-16 rounded-md border object-cover"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttached(a.id)}
                          aria-label="Remove from post"
                          className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 text-muted-foreground shadow-sm hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" /> Generate caption with AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="text-sm font-medium">
                Your idea <span className="text-muted-foreground">(required)</span>
              </label>
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="What's this post about? E.g. 'New summer skincare line — promote our hydrating serum'"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {!workspaceId && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Workspace not loaded. If this persists, check the API is running and you're signed in.
                </p>
              )}
              {workspaceId && !aiPrompt && (
                <p className="text-xs text-muted-foreground">
                  💡 Type your idea above, then click Generate.
                </p>
              )}
              <Button
                onClick={() => generateText.mutate({ platform: activePlatform, prompt: aiPrompt })}
                disabled={!aiPrompt || generateText.isPending || !workspaceId}
                className="w-full"
              >
                {generateText.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Writing caption with AI… (5-15s)
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate {activePlatform} caption
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* AI Image Generation */}
          {/* Media-mode toggle */}
          <div className="mb-3 inline-flex rounded-lg border p-1">
            <button
              type="button"
              aria-pressed={mediaMode === 'image'}
              onClick={() => setMediaMode('image')}
              className={`rounded-md px-3 py-1.5 text-sm ${mediaMode === 'image' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              Image
            </button>
            <button
              type="button"
              aria-pressed={mediaMode === 'video'}
              onClick={() => setMediaMode('video')}
              className={`rounded-md px-3 py-1.5 text-sm ${mediaMode === 'video' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              Video
            </button>
          </div>

          {mediaMode === 'image' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4" /> Generate image with AI
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="text-sm font-medium">
                Describe your image <span className="text-muted-foreground">(required)</span>
              </label>
              <textarea
                rows={3}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image. E.g. 'Sunlit minimalist skincare bottle on marble with rosemary sprig'"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {workspaceId && !imagePrompt && (
                <p className="text-xs text-muted-foreground">
                  💡 Describe what you want above, then click Generate.
                </p>
              )}
              <div className="flex gap-2">
                <select
                  value={imageAspect}
                  onChange={(e) => setImageAspect(e.target.value as typeof imageAspect)}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="1:1">Square 1:1</option>
                  <option value="4:5">Portrait 4:5 (Instagram)</option>
                  <option value="9:16">Vertical 9:16 (Reels/TikTok)</option>
                  <option value="16:9">Landscape 16:9</option>
                </select>
                <select
                  value={imageCount}
                  onChange={(e) => setImageCount(Number(e.target.value))}
                  className="w-24 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value={1}>1 image</option>
                  <option value={2}>2 images</option>
                  <option value={4}>4 images</option>
                </select>
              </div>
              <Button
                onClick={() =>
                  generateImage.mutate({
                    prompt: imagePrompt,
                    aspectRatio: imageAspect,
                    count: imageCount,
                  })
                }
                disabled={!imagePrompt || generateImage.isPending || !workspaceId}
                className="w-full"
              >
                {generateImage.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Drawing your image… (15-30s)
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate {imageCount} image{imageCount === 1 ? '' : 's'}
                  </>
                )}
              </Button>

              {generatedImages.length > 0 && (
                <div>
                  <div className="mb-2 text-xs text-muted-foreground">
                    Click an image to attach to the active {activePlatform} variant.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {generatedImages.map((img) => {
                      const attached = (attachedImageIds[activePlatform] ?? []).includes(img.id);
                      return (
                        <button
                          key={img.id}
                          onClick={() => toggleAttachImage(img.id)}
                          className={`group relative overflow-hidden rounded-md border-2 transition-colors ${
                            attached ? 'border-primary' : 'border-transparent hover:border-border'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={img.prompt}
                            className="aspect-square w-full object-cover"
                          />
                          {attached && (
                            <span className="absolute right-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                              ATTACHED
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {mediaMode === 'video' && (
          <div className="rounded-lg border bg-background p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Clapperboard className="h-4 w-4 text-primary" /> Generate video with AI
            </h3>
            <textarea
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              rows={3}
              placeholder="Describe the video you want…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="video-aspect" className="text-xs font-medium">Aspect ratio</label>
                <select
                  id="video-aspect"
                  value={videoAspect}
                  onChange={(e) => setVideoAspect(e.target.value as '9:16' | '16:9' | '1:1')}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="9:16">9:16 — vertical</option>
                  <option value="16:9">16:9 — landscape</option>
                  <option value="1:1">1:1 — square</option>
                </select>
              </div>
              <div>
                <label htmlFor="video-duration" className="text-xs font-medium">Duration: {videoDuration}s</label>
                <input
                  id="video-duration"
                  type="range"
                  min={2}
                  max={10}
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(Number(e.target.value))}
                  className="mt-3 w-full"
                />
              </div>
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Demo returns a fixed sample clip — it doesn&apos;t read your prompt.
                Prompt-driven video (Runway / Kling / Veo) is coming.
              </span>
            </p>

            <button
              type="button"
              disabled={!videoPrompt.trim() || generateVideo.isPending || videoStatus.data?.status === 'GENERATING'}
              onClick={() => generateVideo.mutate()}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {generateVideo.isPending || videoStatus.data?.status === 'GENERATING' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <>Generate video</>
              )}
            </button>

            {videoStatus.data?.status === 'READY' && videoStatus.data?.mediaAsset && (
              <div className="mt-4">
                {(() => {
                  const asset = videoStatus.data.mediaAsset!;
                  return (
                    <>
                      <video
                        src={asset.url}
                        controls
                        preload="metadata"
                        aria-label="Generated video preview"
                        className="w-full max-w-sm rounded-lg border"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sample clip · Demo provider (not generated from your prompt).
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachedImageIds((ids) => {
                            const current = ids[activePlatform] ?? [];
                            return current.includes(asset.id)
                              ? ids
                              : { ...ids, [activePlatform]: [...current, asset.id] };
                          });
                          setAttachedAssets((m) => ({ ...m, [asset.id]: { url: asset.url, type: 'video' } }));
                          toast.success('Video attached to post');
                        }}
                        className="mt-2 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary"
                      >
                        Attach to post
                      </button>
                    </>
                  );
                })()}
              </div>
            )}

            {videoStatus.data?.status === 'FAILED' && (
              <p className="mt-3 text-sm text-destructive">{videoStatus.data?.errorMessage ?? 'Generation failed.'}</p>
            )}
          </div>
          )}
        </div>

        {/* Right: Virality score + algorithm coach */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Virality Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-center">
                <div className="text-5xl font-bold text-primary">
                  {activeScore?.score ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground">/ 100</div>
              </div>
              {activeScore && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Predicted reach</span>
                    <span className="font-medium">
                      {activeScore.predictedReach.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Engagement rate</span>
                    <span className="font-medium">
                      {(activeScore.predictedEngagementRate * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Algorithm Coach</CardTitle>
            </CardHeader>
            <CardContent>
              {!activeScore?.coachingNotes?.length ? (
                <p className="text-sm text-muted-foreground">
                  Start writing — coaching notes will appear as you go.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activeScore.coachingNotes.map((note, i) => (
                    <li key={i} className="text-sm">
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                            note.severity === 'critical'
                              ? 'bg-red-500'
                              : note.severity === 'warning'
                                ? 'bg-amber-500'
                                : note.severity === 'suggestion'
                                  ? 'bg-blue-500'
                                  : 'bg-muted-foreground'
                          }`}
                        />
                        <div>
                          <div className="font-medium">{note.message}</div>
                          {note.fix && (
                            <div className="mt-1 text-xs text-muted-foreground">{note.fix}</div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
