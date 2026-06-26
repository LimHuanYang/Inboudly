# HyperFrames Template-Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Composition-authoring tasks additionally require the `hyperframes`, `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, and `hyperframes-cli` skills.

**Goal:** Add HyperFrames as a second video engine that renders deterministic, on-brand MP4 "branded clips" from two bundled HTML templates filled with the workspace BrandKit + post text, attachable to a post like any other media.

**Architecture:** A new `HyperframesVideoProvider` implements the existing `VideoProvider` interface and renders by shelling out to `npx hyperframes render --variables '{…}'`. It plugs into the existing detached `VideoGenerationService` runner + `@Cron` reaper, reusing the `VideoGeneration` row, R2 upload, `MediaAsset` registration, polling, and publish pipeline unchanged. A new `POST /ai/video/template-video` endpoint builds the variables (brand tokens + text + per-aspect size) and creates the job.

**Tech Stack:** NestJS + Prisma (Postgres), Next.js 15 + TanStack Query v5, HyperFrames CLI (Node 22+, headless Chromium, FFmpeg), Jest.

**Branch:** `feat/hyperframes-template-video` (already created).

**Scope:** v1 = B0 (spike) → B1 (engine) → B2 (composer). B3 (chaining on Higgsfield) is out of scope (separate spec).

---

## File Structure

**Create:**
- `apps/api/src/modules/ai/video/template-video/size-for-aspect.ts` — pure `aspectRatio → {width,height}`.
- `apps/api/src/modules/ai/video/template-video/size-for-aspect.spec.ts`
- `apps/api/src/modules/ai/video/template-video/brand-to-variables.ts` — pure `BrandKit → composition variables`.
- `apps/api/src/modules/ai/video/template-video/brand-to-variables.spec.ts`
- `apps/api/src/modules/ai/video/template-video/templates/index.ts` — template registry (ids, required vars, default duration, dir).
- `apps/api/src/modules/ai/video/template-video/templates/bilingual-caption/` — HyperFrames composition project.
- `apps/api/src/modules/ai/video/template-video/templates/launch/` — HyperFrames composition project.
- `apps/api/src/modules/ai/video/hyperframes-video.provider.ts` — the provider (CLI shell-out).
- `apps/api/src/modules/ai/video/hyperframes-video.provider.spec.ts`

**Modify:**
- `packages/database/prisma/schema.prisma` — `VideoGeneration` += `templateId String?`, `variables Json?`.
- `packages/shared/src/schemas.ts` — `VideoProviderSchema` enum += `'hyperframes'`; add `CreateTemplateVideoSchema`.
- `apps/api/src/modules/ai-credentials/ai-credentials.service.ts` — `VideoProviderName`, `DEFAULT_VIDEO_MODELS`, `IMPLEMENTED_VIDEO_PROVIDERS` += hyperframes.
- `apps/api/src/modules/ai/video/video-provider.interface.ts` — `VideoGenerateParams` += optional `templateId`, `variables`.
- `apps/api/src/modules/ai/video/video-generation.service.ts` — `createTemplateJob()`, `adapterFor` case, constructor inject, `run()` passthrough.
- `apps/api/src/modules/ai/video/video-generation.controller.ts` — `POST template-video`.
- `apps/api/src/modules/ai/ai.module.ts` — register `HyperframesVideoProvider`.
- `apps/web/src/app/dashboard/composer/page.tsx` — "Branded clip" card.

---

## Task B0: Spike — prove the render env + confirm the variable-binding syntax

**Files:** none committed to `src` (scratch dir under `/tmp`).

- [ ] **Step 1: Confirm the toolchain**

Run: `npx hyperframes doctor`
Expected: Node ≥ 22, FFmpeg found, Chromium found (if missing: `npx hyperframes browser`).

- [ ] **Step 2: Scaffold a throwaway composition**

Run: `cd $(mktemp -d) && npx hyperframes init spike && cd spike`
Expected: a project with `index.html` + `hyperframes.json`.

- [ ] **Step 3: Add a declared variable and bind it in the DOM**

Using the `hyperframes-core` skill (`references/variables-and-media.md`), declare a `brand_primary` (color) and a `caption_en` (string) variable on the root and bind them (background + text). This step **confirms the exact variable declaration + binding syntax** that Task 6 will rely on — record it in a comment at the top of `templates/index.ts` later.

- [ ] **Step 4: Render with injected variables**

Run: `npx hyperframes render --variables '{"brand_primary":"#ff3d8b","caption_en":"Fresh today"}' --quality draft --output spike.mp4`
Expected: exit 0; `spike.mp4` exists and is non-empty; opening it shows the pink background + text.

- [ ] **Step 5: Record findings**

Write the confirmed variable-binding syntax + the exact `render` flags into the PR description / a scratch note. No commit. **Gate:** do not start B1 until a real render succeeds here.

---

## Task B1.1: Prisma — add `templateId` + `variables` to `VideoGeneration`

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (the `VideoGeneration` model, ~lines 314-334)

- [ ] **Step 1: Add the two nullable fields**

In `model VideoGeneration`, after `referenceImageUrl String?`, add:

```prisma
  templateId        String?     // HyperFrames template id (null for Higgsfield)
  variables         Json?       // HyperFrames render variables (brand tokens + text + size + __hash)
```

- [ ] **Step 2: Regenerate the client + push**

Run: `pnpm --filter @inboudly/database db:generate && pnpm --filter @inboudly/database db:push`
Expected: client regenerates; `db push` reports the two new columns added. (If `db:generate` hits a Windows EPERM on the query-engine DLL, stop the dev server first — a node process holds it.)

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/schema.prisma
git commit -m "feat(db): VideoGeneration += templateId + variables (hyperframes)"
```

---

## Task B1.2: Shared schema — `hyperframes` provider + `CreateTemplateVideoSchema`

**Files:**
- Modify: `packages/shared/src/schemas.ts:101` and after `GenerateVideoSchema`
- Test: `packages/shared/src/create-template-video-schema.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/create-template-video-schema.spec.ts`:

```ts
import { CreateTemplateVideoSchema } from './schemas';

const WS = 'clz0000000000000000000000';

it('accepts a minimal bilingual-caption request', () => {
  const out = CreateTemplateVideoSchema.parse({
    workspaceId: WS,
    templateId: 'bilingual-caption',
    aspectRatio: '9:16',
    captionEn: 'Fresh today',
    captionZh: '今日新鲜',
  });
  expect(out.templateId).toBe('bilingual-caption');
  expect(out.aspectRatio).toBe('9:16');
});

it('rejects an unknown templateId', () => {
  expect(() =>
    CreateTemplateVideoSchema.parse({ workspaceId: WS, templateId: 'nope', aspectRatio: '1:1' }),
  ).toThrow();
});

it('defaults aspectRatio to 9:16', () => {
  const out = CreateTemplateVideoSchema.parse({ workspaceId: WS, templateId: 'launch', title: 'Spring menu' });
  expect(out.aspectRatio).toBe('9:16');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @inboudly/shared test -- create-template-video`
Expected: FAIL — `CreateTemplateVideoSchema` is not exported.

- [ ] **Step 3: Implement**

In `packages/shared/src/schemas.ts`, change line 101:

```ts
export const VideoProviderSchema = z.enum(['higgsfield', 'hyperframes']);
```

After `export type GenerateVideoInput = …` (line 116), add:

```ts
export const TemplateIdSchema = z.enum(['bilingual-caption', 'launch']);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const CreateTemplateVideoSchema = z.object({
  workspaceId: z.string().cuid(),
  templateId: TemplateIdSchema,
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  captionEn: z.string().max(280).optional(),
  captionZh: z.string().max(280).optional(),
  title: z.string().max(120).optional(),
  cta: z.string().max(60).optional(),
  backgroundUrl: z.string().url().optional(),
});
export type CreateTemplateVideoInput = z.infer<typeof CreateTemplateVideoSchema>;
```

- [ ] **Step 4: Run to verify it passes + rebuild shared**

Run: `pnpm --filter @inboudly/shared test -- create-template-video && pnpm --filter @inboudly/shared build`
Expected: PASS; build succeeds (so the API picks up the new exports).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/create-template-video-schema.spec.ts
git commit -m "feat(shared): hyperframes provider + CreateTemplateVideoSchema"
```

---

## Task B1.3: ai-credentials — register `hyperframes` as an implemented provider

**Files:**
- Modify: `apps/api/src/modules/ai-credentials/ai-credentials.service.ts:22,47-52`

- [ ] **Step 1: Widen the type + maps**

Line 22:

```ts
export type VideoProviderName = 'higgsfield' | 'hyperframes';
```

Lines 47-49 (`DEFAULT_VIDEO_MODELS`):

```ts
export const DEFAULT_VIDEO_MODELS: Record<VideoProviderName, string> = {
  higgsfield: 'higgsfield',
  hyperframes: 'hyperframes',
} as const;
```

Line 52:

```ts
export const IMPLEMENTED_VIDEO_PROVIDERS: VideoProviderName[] = ['higgsfield', 'hyperframes'];
```

(No change to `resolveVideoProvider` — the template path does not resolve a credential; HyperFrames needs no key.)

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @inboudly/api type-check`
Expected: PASS (the `Record<VideoProviderName, …>` now requires — and has — the `hyperframes` entry).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/ai-credentials/ai-credentials.service.ts
git commit -m "feat(api): register hyperframes as an implemented video provider"
```

---

## Task B1.4: `size-for-aspect.ts` (pure, TDD)

**Files:**
- Create: `apps/api/src/modules/ai/video/template-video/size-for-aspect.ts`
- Test: `apps/api/src/modules/ai/video/template-video/size-for-aspect.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { sizeForAspect } from './size-for-aspect';

it('maps each aspect ratio to standard portrait/square/landscape dims', () => {
  expect(sizeForAspect('9:16')).toEqual({ width: 1080, height: 1920 });
  expect(sizeForAspect('1:1')).toEqual({ width: 1080, height: 1080 });
  expect(sizeForAspect('16:9')).toEqual({ width: 1920, height: 1080 });
});

it('falls back to 9:16 for an unknown ratio', () => {
  expect(sizeForAspect('weird' as never)).toEqual({ width: 1080, height: 1920 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @inboudly/api test -- size-for-aspect`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @inboudly/api test -- size-for-aspect`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/video/template-video/size-for-aspect.ts apps/api/src/modules/ai/video/template-video/size-for-aspect.spec.ts
git commit -m "feat(api): size-for-aspect helper"
```

---

## Task B1.5: `brand-to-variables.ts` (pure, TDD)

**Files:**
- Create: `apps/api/src/modules/ai/video/template-video/brand-to-variables.ts`
- Test: `apps/api/src/modules/ai/video/template-video/brand-to-variables.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { brandToVariables, DEFAULT_BRAND_VARIABLES } from './brand-to-variables';

it('maps BrandKit fields to composition variables', () => {
  const out = brandToVariables({
    primaryColor: '#ff3d8b',
    secondaryColor: '#222',
    accentColor: '#f5d90a',
    fontFamily: 'Space Grotesk',
    logoUrl: 'https://cdn/logo.png',
    logoLightUrl: null,
  });
  expect(out).toEqual({
    brand_primary: '#ff3d8b',
    brand_accent: '#f5d90a',
    brand_font: 'Space Grotesk',
    logo_url: 'https://cdn/logo.png',
  });
});

it('uses accent ?? secondary for brand_accent, and logoUrl ?? logoLightUrl', () => {
  const out = brandToVariables({
    primaryColor: '#000', secondaryColor: '#abc', accentColor: null,
    fontFamily: null, logoUrl: null, logoLightUrl: 'https://cdn/light.png',
  });
  expect(out.brand_accent).toBe('#abc');
  expect(out.logo_url).toBe('https://cdn/light.png');
});

it('returns safe defaults when the kit is null', () => {
  expect(brandToVariables(null)).toEqual(DEFAULT_BRAND_VARIABLES);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @inboudly/api test -- brand-to-variables`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/** Subset of BrandKit fields the templates consume. */
export type BrandKitLike = {
  primaryColor: string;
  secondaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  logoUrl?: string | null;
  logoLightUrl?: string | null;
};

export type BrandVariables = {
  brand_primary: string;
  brand_accent: string;
  brand_font: string;
  logo_url: string;
};

/** Used when a workspace has no BrandKit yet — neutral, legible defaults. */
export const DEFAULT_BRAND_VARIABLES: BrandVariables = {
  brand_primary: '#111827',
  brand_accent: '#6366f1',
  brand_font: 'Inter, system-ui, sans-serif',
  logo_url: '',
};

/** Map a BrandKit (or null) to the composition's brand variables. Pure. */
export function brandToVariables(kit: BrandKitLike | null): BrandVariables {
  if (!kit) return DEFAULT_BRAND_VARIABLES;
  return {
    brand_primary: kit.primaryColor || DEFAULT_BRAND_VARIABLES.brand_primary,
    brand_accent: kit.accentColor || kit.secondaryColor || DEFAULT_BRAND_VARIABLES.brand_accent,
    brand_font: kit.fontFamily || DEFAULT_BRAND_VARIABLES.brand_font,
    logo_url: kit.logoUrl || kit.logoLightUrl || '',
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @inboudly/api test -- brand-to-variables`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/video/template-video/brand-to-variables.ts apps/api/src/modules/ai/video/template-video/brand-to-variables.spec.ts
git commit -m "feat(api): brand-to-variables helper"
```

---

## Task B1.6: Template registry + the two compositions

**Files:**
- Create: `apps/api/src/modules/ai/video/template-video/templates/index.ts`
- Create: `apps/api/src/modules/ai/video/template-video/templates/bilingual-caption/` (HyperFrames project)
- Create: `apps/api/src/modules/ai/video/template-video/templates/launch/` (HyperFrames project)

> Compositions are authored with the `hyperframes` skills, NOT hand-written here — that toolchain enforces the determinism rules and is validated by `lint`/`validate`/`inspect`. The plan fixes the **contract** each must satisfy.

> **B0-confirmed mechanism (use exactly this):** declare variables on `<html>` as `data-composition-variables='[{"id":"caption_en","type":"string","label":"…","default":"…"}]'` (types seen: `color`, `string`, `number`). Bind in a **synchronous** `<script>`: `const v = window.__hyperframes ? window.__hyperframes.getVariables() : {}` → then set CSS custom properties (`document.documentElement.style.setProperty('--brand-primary', v.brand_primary)`) and `el.textContent`. **Output size is set by `data-width`/`data-height` on the sized root — there is NO `--width`/`--height` CLI flag** — so the init script must set the root's `data-width`/`data-height` + inline `width`/`height` from the `width`/`height` variables. Render dimension overrides via `--variables-file` (NOT inline `--variables`, which the Windows shell mangles). The B0 spike's full working `index.html` is the reference pattern (in the spike report).

- [ ] **Step 1: Author `bilingual-caption`**

Scaffold (`npx hyperframes init` inside the dir) and author a standalone composition that declares these variables (use the binding syntax confirmed in B0): `brand_primary`, `brand_accent`, `brand_font`, `logo_url`, `caption_en`, `caption_zh`, `background_url`, `width`, `height`, `duration`. Visual intent: `caption_en` (top) + `caption_zh` (below) as bold lower-thirds over `background_url` (or a `brand_primary` card when empty); small `logo_url` mark; subtle fade/slide in. Sized root must use `width`×`height`. Default duration 6s.

- [ ] **Step 2: Validate `bilingual-caption`**

Run (in the template dir): `npx hyperframes lint && npx hyperframes validate && npx hyperframes inspect`
Expected: 0 errors each. Then render via a vars file (inline `--variables` is mangled by the Windows shell): write `vars.json` = `{"brand_primary":"#ff3d8b","caption_en":"Fresh today","caption_zh":"今日新鲜","width":1080,"height":1920,"duration":6}` and run `npx hyperframes render --variables-file vars.json --quality draft --output bc.mp4` → exit 0, plays correctly.
**Dimension gate (critical):** render a second time with `"width":1080,"height":1080` and `ffprobe` both outputs — confirm the pixel dimensions actually differ (1080×1920 vs 1080×1080). If variable-driven sizing does NOT take effect (the renderer reads `data-width`/`height` before the init script), fall back to per-aspect template copies (`bilingual-caption-9x16`, `-1x1`, `-16x9`) and update the registry + the `createTemplateJob` consumer accordingly; note the change.

- [ ] **Step 3: Author + validate `launch`**

Same process. Variables: `brand_primary`, `brand_accent`, `brand_font`, `logo_url`, `title`, `cta`, `background_url`, `width`, `height`, `duration`. Visual intent: a `title` headline + a `cta` pill in `brand_accent` over `background_url`/brand card; logo mark. Validate with the same three commands + a draft render.

- [ ] **Step 4: Write the registry**

`templates/index.ts`:

```ts
import { join } from 'path';

export type TemplateDef = {
  id: string;
  dir: string;
  required: string[];
  defaultDurationSec: number;
};

const ROOT = join(__dirname);

export const TEMPLATES: Record<string, TemplateDef> = {
  'bilingual-caption': {
    id: 'bilingual-caption',
    dir: join(ROOT, 'bilingual-caption'),
    required: ['brand_primary', 'brand_font', 'width', 'height'],
    defaultDurationSec: 6,
  },
  launch: {
    id: 'launch',
    dir: join(ROOT, 'launch'),
    required: ['brand_primary', 'brand_font', 'title', 'width', 'height'],
    defaultDurationSec: 6,
  },
};

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES[id];
}
```

> **Build note:** the template dirs are runtime assets. Ensure `apps/api`'s build copies `template-video/templates/**` into `dist` (nest-cli `compilerOptions.assets`). If `nest-cli.json` has an `assets` array, add `{ "include": "modules/ai/video/template-video/templates/**/*", "outDir": "dist", "watchAssets": true }`; verify after Task B1.10's boot.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/video/template-video/templates
git commit -m "feat(api): bilingual-caption + launch HyperFrames templates + registry"
```

---

## Task B1.7: `HyperframesVideoProvider` (CLI shell-out, TDD)

**Files:**
- Create: `apps/api/src/modules/ai/video/hyperframes-video.provider.ts`
- Test: `apps/api/src/modules/ai/video/hyperframes-video.provider.spec.ts`

- [ ] **Step 1: Write the failing test (mock the CLI + deps)**

```ts
import { HyperframesVideoProvider } from './hyperframes-video.provider';
import { BadRequestException } from '@nestjs/common';

function deps() {
  const media = { register: jest.fn().mockResolvedValue({ id: 'asset1', url: 'https://cdn/x.mp4' }) } as any;
  const r2 = { putObject: jest.fn().mockResolvedValue('https://cdn/x.mp4') } as any;
  return { media, r2 };
}

const baseParams = (over: any = {}) => ({
  workspaceId: 'w', prompt: 'branded clip', durationSec: 6, aspectRatio: '9:16',
  model: 'bilingual-caption', templateId: 'bilingual-caption',
  variables: { brand_primary: '#ff3d8b', brand_font: 'Inter', width: 1080, height: 1920, caption_en: 'hi' },
  ...over,
});

it('rejects an unknown templateId before rendering', async () => {
  const { media, r2 } = deps();
  const p = new HyperframesVideoProvider(media, r2);
  await expect(p.generate('', baseParams({ templateId: 'nope' }))).rejects.toBeInstanceOf(BadRequestException);
  expect(r2.putObject).not.toHaveBeenCalled();
});

it('renders, uploads to R2, registers the asset, and returns it', async () => {
  const { media, r2 } = deps();
  const p = new HyperframesVideoProvider(media, r2);
  // Stub the protected render hook so no real CLI runs.
  jest.spyOn(p as any, 'renderToBuffer').mockResolvedValue(Buffer.from('fake-mp4'));
  const out = await p.generate('', baseParams());
  expect(r2.putObject).toHaveBeenCalledWith(
    expect.stringMatching(/^videos\/hyperframes\/.*\.mp4$/), expect.any(Buffer), 'video/mp4',
  );
  expect(media.register).toHaveBeenCalledWith(expect.objectContaining({
    type: 'VIDEO', source: 'AI_GENERATED', width: 1080, height: 1920, durationSec: 6,
    aiModel: 'hyperframes:bilingual-caption',
  }));
  expect(out).toEqual({ asset: { id: 'asset1', url: 'https://cdn/x.mp4' }, model: 'hyperframes' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @inboudly/api test -- hyperframes-video.provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { cp, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaService } from '../../media/media.service';
import { R2StorageService } from '../../media/r2-storage.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { VideoProvider, VideoGenerateParams, VideoGenerateResult } from './video-provider.interface';
import { getTemplate } from './template-video/templates';

const execFileAsync = promisify(execFile);
const RENDER_TIMEOUT_MS = 4 * 60 * 1000;

/**
 * HyperFrames branded-clip renderer. Deterministic HTML→MP4 via the local CLI
 * (`npx hyperframes render --variables …`). No API key (free/local); no
 * reference image. The composition templates are bundled under template-video/.
 */
@Injectable()
export class HyperframesVideoProvider implements VideoProvider {
  readonly name = 'hyperframes';
  private readonly logger = new Logger(HyperframesVideoProvider.name);

  constructor(private media: MediaService, private r2: R2StorageService) {}

  async generate(_apiKey: string, params: VideoGenerateParams): Promise<VideoGenerateResult> {
    const tpl = params.templateId ? getTemplate(params.templateId) : undefined;
    if (!tpl) {
      throw new BadRequestException(`Unknown HyperFrames template "${params.templateId}".`);
    }
    const variables = stripInternal(params.variables ?? {});
    for (const key of tpl.required) {
      if (variables[key] === undefined || variables[key] === '') {
        throw new BadRequestException(`HyperFrames template "${tpl.id}" is missing "${key}".`);
      }
    }

    const buf = await this.renderToBuffer(tpl.dir, variables);
    const url = await this.r2.putObject(`videos/hyperframes/${randomUUID()}.mp4`, buf, 'video/mp4');
    const asset = await this.media.register({
      workspaceId: params.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.AI_GENERATED,
      url,
      filename: `${tpl.id}.mp4`,
      mimeType: 'video/mp4',
      sizeBytes: buf.length,
      width: Number(variables.width) || undefined,
      height: Number(variables.height) || undefined,
      durationSec: params.durationSec,
      aiPrompt: params.prompt,
      aiModel: `hyperframes:${tpl.id}`,
    });
    this.logger.log(`HyperFrames ${tpl.id} for workspace ${params.workspaceId} (asset ${asset.id})`);
    return { asset: { id: asset.id, url: asset.url }, model: 'hyperframes' };
  }

  /** Copy the template to a temp dir and render it with injected variables.
   *  B0 spike: inline `--variables` JSON breaks under Windows shell quoting, so write
   *  a vars.json and use `--variables-file`. shell:true because `npx` is `npx.cmd` on
   *  Windows; relative filenames (cwd=work) keep the command free of spaces. */
  protected async renderToBuffer(templateDir: string, variables: Record<string, unknown>): Promise<Buffer> {
    const work = await mkdtemp(join(tmpdir(), 'hf-'));
    try {
      await cp(templateDir, work, { recursive: true });
      await writeFile(join(work, 'vars.json'), JSON.stringify(variables), 'utf8');
      await execFileAsync(
        'npx',
        ['hyperframes', 'render', '--variables-file', 'vars.json', '--quality', 'standard', '--format', 'mp4', '--output', 'out.mp4'],
        { cwd: work, timeout: RENDER_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, shell: true },
      );
      return await readFile(join(work, 'out.mp4'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`HyperFrames render failed: ${msg.slice(0, 300)}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}

/** Drop reserved keys (e.g. __hash) before passing variables to the CLI. */
function stripInternal(vars: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(vars).filter(([k]) => !k.startsWith('__')));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @inboudly/api test -- hyperframes-video.provider`
Expected: PASS (2 tests; the render is stubbed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai/video/hyperframes-video.provider.ts apps/api/src/modules/ai/video/hyperframes-video.provider.spec.ts
git commit -m "feat(api): HyperframesVideoProvider (CLI shell-out)"
```

---

## Task B1.8: Wire the provider into the runner (interface + service)

**Files:**
- Modify: `apps/api/src/modules/ai/video/video-provider.interface.ts`
- Modify: `apps/api/src/modules/ai/video/video-generation.service.ts`
- Test: `apps/api/src/modules/ai/video/video-generation.service.spec.ts`

- [ ] **Step 1: Extend the params type**

In `video-provider.interface.ts`, add two optional fields to `VideoGenerateParams`:

```ts
export type VideoGenerateParams = {
  workspaceId: string;
  prompt: string;
  durationSec: number;
  aspectRatio: string;
  model: string;
  referenceImageUrl?: string;
  templateId?: string;
  variables?: Record<string, unknown>;
};
```

- [ ] **Step 2: Write the failing test for `createTemplateJob`**

Create `apps/api/src/modules/ai/video/video-generation.service.spec.ts`:

```ts
import { VideoGenerationService } from './video-generation.service';
import { VideoStatus } from '@inboudly/database';

function makePrisma(recentReady: any[] = []) {
  const created: any[] = [];
  return {
    created,
    prisma: {
      brandKit: { findFirst: jest.fn().mockResolvedValue({ primaryColor: '#ff3d8b', fontFamily: 'Inter' }) },
      videoGeneration: {
        findMany: jest.fn().mockResolvedValue(recentReady),
        create: jest.fn((a: any) => { created.push(a.data); return Promise.resolve({ id: 'job1', ...a.data }); }),
      },
    } as any,
  };
}

it('createTemplateJob builds variables and creates a GENERATING hyperframes job', async () => {
  const { prisma, created } = makePrisma();
  const svc = new VideoGenerationService(prisma, {} as any, {} as any, { name: 'hyperframes' } as any);
  jest.spyOn(svc as any, 'run').mockReturnValue(undefined);
  await svc.createTemplateJob({ workspaceId: 'w', templateId: 'bilingual-caption', aspectRatio: '9:16', captionEn: 'hi' });
  const data = created[0];
  expect(data.provider).toBe('hyperframes');
  expect(data.status).toBe(VideoStatus.GENERATING);
  expect(data.templateId).toBe('bilingual-caption');
  expect(data.variables.width).toBe(1080);
  expect(data.variables.height).toBe(1920);
  expect(data.variables.brand_primary).toBe('#ff3d8b');
  expect(data.variables.caption_en).toBe('hi');
});

it('createTemplateJob reuses a prior READY render with the same hash (cache hit)', async () => {
  const { prisma, created } = makePrisma();
  const { prisma: p2 } = makePrisma();
  // First, compute what hash the job would get by creating once.
  const svc = new VideoGenerationService(prisma, {} as any, {} as any, { name: 'hyperframes' } as any);
  jest.spyOn(svc as any, 'run').mockReturnValue(undefined);
  await svc.createTemplateJob({ workspaceId: 'w', templateId: 'launch', aspectRatio: '1:1', title: 'X' });
  const hash = created[0].variables.__hash as string;
  // Now a second service whose recent-rows include that hash → should create READY, not run.
  const svc2 = new VideoGenerationService(
    makePrisma([{ mediaAssetId: 'asset9', variables: { __hash: hash } }]).prisma,
    {} as any, {} as any, { name: 'hyperframes' } as any,
  );
  const runSpy = jest.spyOn(svc2 as any, 'run').mockReturnValue(undefined);
  const job = await svc2.createTemplateJob({ workspaceId: 'w', templateId: 'launch', aspectRatio: '1:1', title: 'X' });
  expect(runSpy).not.toHaveBeenCalled();
  expect((job as any).status).toBe(VideoStatus.READY);
  expect((job as any).mediaAssetId).toBe('asset9');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @inboudly/api test -- video-generation.service`
Expected: FAIL — `createTemplateJob` undefined.

- [ ] **Step 4: Implement the service changes**

In `video-generation.service.ts`:

(a) imports at top:

```ts
import { createHash } from 'crypto';
import { HyperframesVideoProvider } from './hyperframes-video.provider';
import { brandToVariables } from './template-video/brand-to-variables';
import { sizeForAspect } from './template-video/size-for-aspect';
import { TEMPLATES } from './template-video/templates';
import type { CreateTemplateVideoInput } from '@inboudly/shared';
```

(b) constructor — add the provider:

```ts
  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
    private higgsfield: HiggsfieldVideoProvider,
    private hyperframes: HyperframesVideoProvider,
  ) {}
```

(c) `adapterFor` — switch on provider:

```ts
  private adapterFor(provider: string): VideoProvider {
    if (provider === 'hyperframes') return this.hyperframes;
    return this.higgsfield;
  }
```

(d) pass `templateId`/`variables` through in `run()`'s `adapter.generate` call:

```ts
        const result = await adapter.generate(apiKey, {
          workspaceId: job.workspaceId,
          prompt: job.prompt,
          durationSec: job.durationSec,
          aspectRatio: job.aspectRatio,
          model: job.model,
          referenceImageUrl: job.referenceImageUrl ?? undefined,
          templateId: job.templateId ?? undefined,
          variables: (job.variables as Record<string, unknown>) ?? undefined,
        });
```

(e) add `createTemplateJob` (after `create`):

```ts
  /** Create a HyperFrames branded-clip job. Builds variables from the workspace's
   *  default BrandKit + the text + the per-aspect size, dedupes by a content hash,
   *  then reuses the existing detached runner. */
  async createTemplateJob(input: CreateTemplateVideoInput) {
    const tpl = TEMPLATES[input.templateId];
    const { width, height } = sizeForAspect(input.aspectRatio);
    const kit = await this.prisma.brandKit.findFirst({
      where: { workspaceId: input.workspaceId, isDefault: true },
    }) ?? await this.prisma.brandKit.findFirst({ where: { workspaceId: input.workspaceId } });

    const variables: Record<string, unknown> = {
      ...brandToVariables(kit as never),
      width, height,
      duration: tpl.defaultDurationSec,
      caption_en: input.captionEn ?? '',
      caption_zh: input.captionZh ?? '',
      title: input.title ?? '',
      cta: input.cta ?? '',
      background_url: input.backgroundUrl ?? '',
    };
    const hash = createHash('sha256')
      .update(input.templateId + '|' + stableStringify(variables))
      .digest('hex');
    variables.__hash = hash;

    // Cache: reuse a recent identical render.
    const recent = await this.prisma.videoGeneration.findMany({
      where: { workspaceId: input.workspaceId, provider: 'hyperframes', status: VideoStatus.READY, mediaAssetId: { not: null } },
      orderBy: { createdAt: 'desc' }, take: 50,
      select: { mediaAssetId: true, variables: true },
    });
    const hit = recent.find((r) => (r.variables as { __hash?: string })?.__hash === hash);

    const job = await this.prisma.videoGeneration.create({
      data: {
        workspaceId: input.workspaceId,
        prompt: `branded clip · ${input.templateId}`,
        provider: 'hyperframes',
        model: input.templateId,
        templateId: input.templateId,
        variables: variables as never,
        aspectRatio: input.aspectRatio,
        durationSec: tpl.defaultDurationSec,
        status: hit ? VideoStatus.READY : VideoStatus.GENERATING,
        mediaAssetId: hit?.mediaAssetId ?? null,
      },
    });
    if (!hit) void this.run(job.id, '');
    return job;
  }
```

(f) add the `stableStringify` helper at the bottom of the file (module scope):

```ts
function stableStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(obj).filter((k) => k !== '__hash').sort().reduce((a, k) => { a[k] = obj[k]; return a; }, {} as Record<string, unknown>),
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @inboudly/api test -- video-generation.service`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/ai/video/video-provider.interface.ts apps/api/src/modules/ai/video/video-generation.service.ts apps/api/src/modules/ai/video/video-generation.service.spec.ts
git commit -m "feat(api): createTemplateJob + adapterFor(hyperframes) + variables passthrough + render cache"
```

---

## Task B1.9: Endpoint + module registration

**Files:**
- Modify: `apps/api/src/modules/ai/video/video-generation.controller.ts`
- Modify: `apps/api/src/modules/ai/ai.module.ts`

- [ ] **Step 1: Add the controller method**

In `video-generation.controller.ts`, import the schema/type and add a method (the route is `POST /ai/video/template-video`):

```ts
import { GenerateVideoSchema, CreateTemplateVideoSchema, type GenerateVideoInput, type CreateTemplateVideoInput } from '@inboudly/shared';
```

```ts
  /** Start a HyperFrames branded-clip job. Same polling as /ai/video/:id. */
  @Post('template-video')
  async templateVideo(
    @Body(new ZodValidationPipe(CreateTemplateVideoSchema)) input: CreateTemplateVideoInput,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(input.workspaceId, user.supabaseUserId);
    return this.videos.createTemplateJob(input);
  }
```

- [ ] **Step 2: Register the provider in the module**

In `ai.module.ts`, import and add `HyperframesVideoProvider` to `providers`:

```ts
import { HyperframesVideoProvider } from './video/hyperframes-video.provider';
```

```ts
  providers: [
    GeminiTextService,
    GeminiImageService,
    EmbeddingsService,
    HiggsfieldVideoProvider,
    HyperframesVideoProvider,
    VideoGenerationService,
    WorkspacesService,
  ],
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @inboudly/api type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/ai/video/video-generation.controller.ts apps/api/src/modules/ai/ai.module.ts
git commit -m "feat(api): POST /ai/video/template-video + register HyperframesVideoProvider"
```

---

## Task B1.10: API validation + clean boot

- [ ] **Step 1: Full type-check + tests**

Run: `pnpm type-check && pnpm --filter @inboudly/api test`
Expected: type-check 4/4; all API tests pass (≥ 102 + the new ones).

- [ ] **Step 2: Boot + confirm the route + the asset copy**

Run: `pnpm --filter @inboudly/api dev` (or the repo's dev). In the boot log confirm `Mapped {/api/v1/ai/video/template-video, POST}` and no errors. Confirm `dist/.../template-video/templates/bilingual-caption/index.html` exists (the nest-cli asset copy from B1.6).
Expected: route mapped; templates present in `dist`.

- [ ] **Step 3: Commit any nest-cli.json asset fix** (if Step 2 showed the templates missing from `dist`).

```bash
git add apps/api/nest-cli.json
git commit -m "chore(api): copy hyperframes templates into dist"
```

---

## Task B2.1: Composer "Branded clip" card

**Files:**
- Modify: `apps/web/src/app/dashboard/composer/page.tsx`

> Mirror the existing Higgsfield video panel: a mutation that POSTs the job, the existing `videoStatus` polling (`GET /ai/video/:id`), and the same "attach on READY" path. Reuse `GenerationsTray`.

- [ ] **Step 1: Add a "Branded clip" media mode + template/size state**

Add to the media-mode toggle a third option `'branded'` next to `'image' | 'video'`. Add state:

```tsx
const [brandedTemplate, setBrandedTemplate] = useState<'bilingual-caption' | 'launch'>('bilingual-caption');
const [brandedJobId, setBrandedJobId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the create mutation (prefill captions from variants)**

```tsx
const generateBranded = useMutation({
  mutationFn: () =>
    api.post<{ id: string }>('/ai/video/template-video', {
      workspaceId,
      templateId: brandedTemplate,
      aspectRatio: videoAspect,
      captionEn: captions[selectedPlatforms.find((p) => p !== 'REDNOTE') ?? activePlatform] || undefined,
      captionZh: captions['REDNOTE'] || undefined,
      title: captions[activePlatform]?.slice(0, 120) || undefined,
    }),
  onSuccess: (job) => {
    setBrandedJobId(job.id);
    setVideoJobId(job.id); // reuse the existing videoStatus poller + attach-on-READY
    qc.invalidateQueries({ queryKey: ['video-jobs', workspaceId] });
  },
  onError: (err: any) =>
    toast.error("Couldn't start the branded clip", { description: err?.message ?? 'Please try again.', duration: 8000 }),
});
```

- [ ] **Step 3: Render the card (only when mediaMode === 'branded')**

A card with: a template picker (Bilingual caption / Launch), a one-line note that it uses the workspace BrandKit, a Generate button (`disabled={generateBranded.isPending || videoStatus.data?.status === 'GENERATING'}`), and — reusing the existing `videoStatus.data?.status === 'READY'` block — the same preview + "attach" affordance the Higgsfield video uses. (The existing READY handler already attaches `videoStatus.data.mediaAsset`.)

- [ ] **Step 4: Type-check + compile**

Run: `pnpm --filter @inboudly/web type-check`
Expected: PASS. Then load `/dashboard/composer` → HTTP 200; the "Branded clip" mode renders.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/composer/page.tsx
git commit -m "feat(web): composer Branded clip (HyperFrames) card"
```

---

## Task B2.2: Full validation + manual smoke notes

- [ ] **Step 1: Full validation**

Run: `pnpm type-check && pnpm --filter @inboudly/api test`
Expected: green.

- [ ] **Step 2: Live smoke (manual, requires the running app + a workspace)**

Composer → Branded clip → Bilingual caption → Generate → job polls GENERATING → READY → preview shows the on-brand MP4 → attach → it appears in the variant's media → schedule/publish-now flows it through unchanged. Note any gaps for follow-up.

- [ ] **Step 3: Pre-merge adversarial review**

Run the multi-agent review over `main..feat/hyperframes-template-video` (as on Tracks A & publishing UI). Fix confirmed findings, then finish the branch (merge).

---

## Self-Review

**Spec coverage:** D1 (CLI shell-out) → B1.7. D2 (reuse VideoGeneration + templateId/variables) → B1.1 + B1.8. D3 (bundled templates) → B1.6. brand-to-variables → B1.5. size-for-aspect → B1.4. endpoint → B1.9. cache → B1.8. composer card → B2.1. env/spike → B0. Multi-format → B1.4 + variables in B1.8. Non-goals (B3, BYOK key, template editor) — none scheduled. ✓ All spec sections map to a task.

**Placeholder scan:** Composition authoring (B1.6) is delegated to the hyperframes skills + `lint/validate/inspect` gates rather than inline GSAP — deliberate (that toolchain enforces determinism), with an explicit variable contract + validation commands, so it is not a hand-wave. All TS code blocks are complete.

**Type consistency:** `templateId`/`variables` added in B1.1 (Prisma) match B1.8 (`VideoGenerateParams`, `createTemplateJob`). `CreateTemplateVideoSchema`/`CreateTemplateVideoInput` (B1.2) used in B1.9. `TEMPLATES`/`getTemplate` (B1.6) used in B1.7/B1.8. `brandToVariables`/`sizeForAspect` (B1.4/B1.5) used in B1.8. `HyperframesVideoProvider` (B1.7) injected in B1.8 + registered B1.9. Variable names (`brand_primary`, `caption_en`, `width`…) consistent across B1.5/B1.6/B1.8. ✓
