import { type CreatePostInput } from './schemas';
import { type SocialPlatform } from './platforms';

/** "#a #b  c" -> ["a","b","c"]; strips leading #, splits on whitespace, drops empties. */
export function parseHashtags(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\s+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter((t) => t.length > 0);
}

type Rec<T> = Partial<Record<SocialPlatform, T>>;

/** Turn the Composer draft into a CreatePostInput (one variant per selected platform). */
export function buildCreatePostInput(args: {
  workspaceId: string;
  selectedPlatforms: SocialPlatform[];
  captions: Rec<string>;
  hashtags: Rec<string>;
  attachedImageIds: Rec<string[]>;
  platformOptions?: Rec<Record<string, unknown>>;
  /** Per-platform BCP-47 language tag (e.g. 'zh-CN' for REDNOTE). Defaults to 'en'. */
  languages?: Partial<Record<SocialPlatform, string>>;
}): CreatePostInput {
  return {
    workspaceId: args.workspaceId,
    variants: args.selectedPlatforms.map((p) => ({
      platform: p,
      caption: (args.captions[p] ?? '').trim(),
      language: args.languages?.[p] ?? 'en',
      hashtags: parseHashtags(args.hashtags[p]),
      mentions: [],
      mediaAssetIds: args.attachedImageIds[p] ?? [],
      ...(args.platformOptions?.[p] ? { platformOptions: args.platformOptions[p] } : {}),
    })),
    approvalRequired: false,
  };
}
