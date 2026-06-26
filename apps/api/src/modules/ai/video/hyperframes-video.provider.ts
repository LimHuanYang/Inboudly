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
import { getTemplate, getTemplateDir, type AspectRatio } from './template-video/templates';

const execFileAsync = promisify(execFile);
const RENDER_TIMEOUT_MS = 4 * 60 * 1000;

/**
 * HyperFrames branded-clip renderer. Deterministic HTML→MP4 via the local CLI.
 * No API key (free/local); no reference image. Templates are bundled under
 * template-video/templates, one composition dir per aspect ratio.
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
    const dir = getTemplateDir(tpl.id, params.aspectRatio as AspectRatio);
    if (!dir) {
      throw new BadRequestException(`No "${params.aspectRatio}" variant for template "${tpl.id}".`);
    }

    const buf = await this.renderToBuffer(dir, variables);
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

  /** Copy the template to a temp dir and render with injected variables. B0 spike:
   *  inline --variables JSON breaks under the Windows shell, so write a vars.json and
   *  use --variables-file. shell:true because npx is npx.cmd on Windows; relative
   *  filenames (cwd=work) keep the command free of spaces. */
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
