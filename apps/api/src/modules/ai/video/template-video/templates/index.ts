import { join } from 'path';

// ── Types ────────────────────────────────────────────────────────────────────

export type AspectRatio = '9:16' | '1:1' | '16:9';

export type TemplateDef = {
  /** Logical template id — e.g. "bilingual-caption", "launch" */
  id: string;
  /** Absolute path to the composition directory for the default aspect (9:16) */
  dir: string;
  /** Variable ids that must be supplied at render time */
  required: string[];
  /** Default clip duration in seconds */
  defaultDurationSec: number;
  /**
   * Per-aspect directory resolver.
   *
   * NOTE — Dimension gate outcome: FALLBACK path taken.
   *
   * The HyperFrames renderer reads `data-width`/`data-height` from the static HTML
   * before the composition script executes, so runtime JS mutations of those attributes
   * are ignored (confirmed by ffprobe: both 9:16 and 1:1 renders from the same
   * variable-driven file produced 1080x1920). To support multiple output dimensions
   * we maintain one composition directory per aspect ratio, each with hard-coded
   * `data-width`/`data-height`.  Pass the desired aspect to `dirFor` or call
   * `getTemplateDir(id, aspect)` — the provider/service layer uses this resolver
   * instead of reading `dir` directly.
   */
  dirFor: (aspect: AspectRatio) => string | undefined;
};

// ── Root ─────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname);

// ── Aspect-suffix map ─────────────────────────────────────────────────────────

const ASPECT_SUFFIX: Record<AspectRatio, string> = {
  '9:16': '9x16',
  '1:1': '1x1',
  '16:9': '16x9',
};

function aspectDir(templateSlug: string, aspect: AspectRatio): string | undefined {
  const suffix = ASPECT_SUFFIX[aspect];
  return suffix ? join(ROOT, `${templateSlug}-${suffix}`) : undefined;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const TEMPLATES: Record<string, TemplateDef> = {
  'bilingual-caption': {
    id: 'bilingual-caption',
    dir: join(ROOT, 'bilingual-caption-9x16'),
    required: ['brand_primary', 'brand_font', 'caption_en', 'caption_zh'],
    defaultDurationSec: 6,
    dirFor: (aspect) => aspectDir('bilingual-caption', aspect),
  },
  launch: {
    id: 'launch',
    dir: join(ROOT, 'launch-9x16'),
    required: ['brand_primary', 'brand_font', 'title', 'cta'],
    defaultDurationSec: 6,
    dirFor: (aspect) => aspectDir('launch', aspect),
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/** Look up a template definition by logical id. Returns undefined if not found. */
export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES[id];
}

/**
 * Resolve the composition directory for a given template id + aspect ratio.
 *
 * @example
 *   getTemplateDir('bilingual-caption', '1:1')
 *   // → .../templates/bilingual-caption-1x1
 */
export function getTemplateDir(id: string, aspect: AspectRatio = '9:16'): string | undefined {
  return TEMPLATES[id]?.dirFor(aspect);
}
