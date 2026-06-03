export type VideoGenerateParams = {
  workspaceId: string;
  prompt: string;
  durationSec: number;
  aspectRatio: string;
  model: string;
  referenceImageUrl?: string;
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
