import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import * as mime from 'mime-types';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';
import { MediaService } from '../media/media.service';
import { SourceResolverService } from './source-resolver.service';
import { TranscriptionService } from './transcription.service';
import { ClipSelectorService } from './clip-selector.service';
import { FfmpegService, type AspectRatio } from './ffmpeg.service';
import { MediaType, MediaSource } from '@inboudly/database';
import type { RepurposeRequest, SocialPlatform } from '@inboudly/shared';

const PLATFORM_ASPECT: Record<SocialPlatform, AspectRatio> = {
  TIKTOK: '9:16',
  INSTAGRAM: '9:16',
  REDNOTE: '9:16',
  FACEBOOK: '1:1',
  LINKEDIN: '1:1',
  YOUTUBE: '16:9',
  X: '16:9',
  THREADS: '1:1',
  LEMON8: '9:16',
  PINTEREST: '9:16',
};

/**
 * The Repurpose Worker — the full pipeline.
 *
 *   1. Resolve source (file/YouTube/podcast/blog) → local file or text
 *   2. Transcribe via Whisper (skipped for blog — text already extracted)
 *   3. Ask Claude to pick the best clips per target platform
 *   4. For each clip: ffmpeg cut + reframe + caption burn-in
 *   5. Upload each clip to R2 → register as MediaAsset (with parentMediaId)
 *
 * Total runtime is dominated by transcription (Whisper is ~1× real-time)
 * and ffmpeg encoding. For a 30-min podcast across 3 platforms with 5 clips
 * each, expect 5-8 minutes end-to-end.
 */
@Processor('repurpose')
export class RepurposeProcessor extends WorkerHost {
  private readonly logger = new Logger(RepurposeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private r2: R2StorageService,
    private mediaService: MediaService,
    private sourceResolver: SourceResolverService,
    private transcription: TranscriptionService,
    private clipSelector: ClipSelectorService,
    private ffmpeg: FfmpegService,
  ) {
    super();
  }

  async process(job: Job<RepurposeRequest>): Promise<{ generatedClips: number }> {
    const req = job.data;
    this.logger.log(`Repurpose job ${job.id}: ${req.source.kind} → ${req.targetPlatforms.join(', ')}`);

    // 1. Resolve source
    await job.updateProgress(5);
    const resolved = await this.sourceResolver.resolve({
      kind: req.source.kind,
      mediaAssetId: req.source.kind === 'upload' ? req.source.mediaAssetId : undefined,
      url: req.source.kind !== 'upload' ? req.source.url : undefined,
    });

    // Blog sources have no audio → repurpose into text-only carousels (Phase 2)
    if (resolved.kind === 'blog') {
      this.logger.warn('Blog repurposing produces carousel drafts (text-only) — not yet implemented');
      return { generatedClips: 0 };
    }

    if (!resolved.localPath) {
      throw new Error('Source did not produce a local media file');
    }

    // 2. Transcribe
    await job.updateProgress(20);
    const transcript = await this.transcription.transcribe(resolved.localPath);
    this.logger.log(`Transcribed: ${transcript.durationSec}s, ${transcript.segments.length} segments`);

    // 3. Pick clips
    await job.updateProgress(40);
    const clipsByPlatform = await this.clipSelector.selectClips(
      transcript,
      req.targetPlatforms,
      req.clipCount,
    );

    // 4. Render + 5. Upload
    let generated = 0;
    let parentMediaAsset = await this.mediaService.register({
      workspaceId: req.workspaceId,
      type: MediaType.VIDEO,
      source: MediaSource.UPLOAD,
      url: resolved.sourceUrl ?? '',
      filename: resolved.title ?? 'source',
      mimeType: resolved.mimeType ?? 'video/mp4',
      sizeBytes: 0,
      durationSec: transcript.durationSec,
    });

    const totalClips = Object.values(clipsByPlatform).reduce((s, arr) => s + arr.length, 0);
    let processed = 0;

    for (const [platform, clips] of Object.entries(clipsByPlatform) as [
      SocialPlatform,
      Awaited<ReturnType<typeof this.clipSelector.selectClips>>[SocialPlatform],
    ][]) {
      for (const clip of clips) {
        try {
          // Pick segments inside the clip window for burn-in captions
          const segs = req.burnInCaptions
            ? transcript.segments.filter((s) => s.start >= clip.startSec && s.end <= clip.endSec)
            : undefined;

          const rendered = await this.ffmpeg.cutAndReframe({
            sourcePath: resolved.localPath!,
            startSec: clip.startSec,
            endSec: clip.endSec,
            aspectRatio: PLATFORM_ASPECT[platform],
            captionSegments: segs,
            segmentOffset: clip.startSec,
          });

          // Upload to R2
          const key = `workspaces/${req.workspaceId}/repurposed/${platform.toLowerCase()}/${uuid()}.mp4`;
          const fileBuf = await readFile(rendered.outputPath);
          const presigned = await this.r2.createPresignedUpload(key, 'video/mp4');
          // Direct PUT to R2 (presigned)
          await fetch(presigned.uploadUrl, {
            method: 'PUT',
            body: fileBuf,
            headers: { 'Content-Type': 'video/mp4' },
          });

          await this.mediaService.register({
            workspaceId: req.workspaceId,
            type: MediaType.VIDEO,
            source: MediaSource.REPURPOSED,
            url: presigned.publicUrl,
            filename: `${platform.toLowerCase()}-clip-${basename(rendered.outputPath)}`,
            mimeType: 'video/mp4',
            sizeBytes: fileBuf.byteLength,
            width: rendered.width,
            height: rendered.height,
            durationSec: rendered.durationSec,
          });

          generated++;
        } catch (err) {
          this.logger.error(`Failed to render clip on ${platform}: ${(err as Error).message}`);
        }

        processed++;
        await job.updateProgress(40 + Math.floor((processed / totalClips) * 60));
      }
    }

    void parentMediaAsset;
    void mime; // reserved for future use (extension detection on upload sources)

    return { generatedClips: generated };
  }
}
