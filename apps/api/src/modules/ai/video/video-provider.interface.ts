export type VideoGenerateParams = {
  workspaceId: string;
  prompt: string;
  durationSec: number;
  aspectRatio: string;
  model: string;
  referenceImageUrl?: string;
  /** HyperFrames: logical template id (e.g. "bilingual-caption"). */
  templateId?: string;
  /** HyperFrames: content variables injected into the composition. */
  variables?: Record<string, unknown>;
};

export type VideoGenerateResult = {
  /** The registered MediaAsset (VIDEO) — at minimum its id and public url. */
  asset: { id: string; url: string };
  model: string;
};

/** A pluggable video-generation engine. Plans 2/3 add Runway/Kling/Veo/Pollinations. */
export interface VideoProvider {
  readonly name: string;
  generate(apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult>;
}
