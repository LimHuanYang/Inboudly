export type AspectRatio = '9:16' | '1:1' | '16:9';
export type Size = { width: number; height: number };

const SIZES: Record<AspectRatio, Size> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

/** Standard render dimensions for a social aspect ratio. Unknown → 9:16. */
export function sizeForAspect(aspect: AspectRatio): Size {
  return SIZES[aspect] ?? SIZES['9:16'];
}
