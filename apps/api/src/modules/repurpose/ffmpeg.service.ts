import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import type { TranscriptSegment } from './transcription.service';

export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

const DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '16:9': { w: 1920, h: 1080 },
};

export interface ClipRenderInput {
  sourcePath: string;
  startSec: number;
  endSec: number;
  aspectRatio: AspectRatio;
  /** Subset of transcript segments fully contained in this clip — for burn-in */
  captionSegments?: TranscriptSegment[];
  /** Offset to subtract from segment timestamps so they start at 0 */
  segmentOffset?: number;
}

export interface ClipRenderResult {
  outputPath: string;
  durationSec: number;
  width: number;
  height: number;
}

/**
 * FFmpeg orchestration. Two operations:
 *   - cutAndReframe: trim to [start,end], scale to target aspect with smart
 *     cropping (centre crop is the v1 — Phase 4 swaps in subject-tracking
 *     reframing once we ship the visual ML model)
 *   - burn-in captions: optional, drawn from transcript segments
 *
 * Requires the ffmpeg binary to be on PATH on the worker host.
 *   apt: apt install ffmpeg
 *   brew: brew install ffmpeg
 *   scoop: scoop install ffmpeg
 */
@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  async cutAndReframe(input: ClipRenderInput): Promise<ClipRenderResult> {
    const { w, h } = DIMENSIONS[input.aspectRatio];
    const dir = mkdtempSync(join(tmpdir(), 'inb-clip-'));
    const outputPath = join(dir, `${uuid()}.mp4`);
    const duration = input.endSec - input.startSec;

    return new Promise((resolve, reject) => {
      let command = ffmpeg(input.sourcePath)
        .setStartTime(input.startSec)
        .setDuration(duration)
        // Scale + centre-crop to target aspect ratio
        .videoFilter([
          `scale=${w}:${h}:force_original_aspect_ratio=increase`,
          `crop=${w}:${h}`,
        ])
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
          '-r 30',
        ]);

      // Burn-in captions if provided
      if (input.captionSegments?.length) {
        const srtPath = this.writeSrt(input.captionSegments, input.segmentOffset ?? input.startSec, dir);
        command = command.videoFilter(
          // Bottom-third positioning, branded styling — white text, drop shadow,
          // semi-transparent box for readability
          `subtitles=${this.escapeForFilter(srtPath)}:force_style='Fontname=Arial,FontSize=18,PrimaryColour=&Hffffff&,OutlineColour=&H80000000&,BorderStyle=3,Outline=1,Shadow=0,MarginV=120'`,
        );
      }

      command
        .on('start', (cmd) => this.logger.debug(`ffmpeg: ${cmd}`))
        .on('error', (err) => {
          this.logger.error(`ffmpeg failed: ${err.message}`);
          reject(err);
        })
        .on('end', () =>
          resolve({ outputPath, durationSec: duration, width: w, height: h }),
        )
        .save(outputPath);
    });
  }

  /** Write a temporary .srt file from transcript segments. */
  private writeSrt(segments: TranscriptSegment[], offsetSec: number, dir: string): string {
    const path = join(dir, `${uuid()}.srt`);
    const lines: string[] = [];
    segments.forEach((s, i) => {
      const start = Math.max(0, s.start - offsetSec);
      const end = Math.max(start + 0.1, s.end - offsetSec);
      lines.push(String(i + 1));
      lines.push(`${this.fmtSrt(start)} --> ${this.fmtSrt(end)}`);
      lines.push(s.text);
      lines.push('');
    });
    require('fs').writeFileSync(path, lines.join('\n'), 'utf8');
    return path;
  }

  private fmtSrt(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec - Math.floor(sec)) * 1000);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
  }

  /**
   * Concatenate clips (in array order) into a single H.264/AAC MP4.
   * Re-encodes for uniform output so mismatched inputs join cleanly.
   */
  async stitchClips(inputPaths: string[], outPath: string): Promise<void> {
    if (inputPaths.length === 0) {
      throw new Error('stitchClips: inputPaths must not be empty');
    }

    const n = inputPaths.length;
    // Build filter_complex concat expression: [0:v][0:a][1:v][1:a]...concat=n=N:v=1:a=1[v][a]
    const streams = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
    const filterComplex = `${streams}concat=n=${n}:v=1:a=1[v][a]`;

    return new Promise((resolve, reject) => {
      let command = ffmpeg();

      for (const p of inputPaths) {
        command = command.input(p);
      }

      command
        .complexFilter(filterComplex)
        .outputOptions([
          '-map [v]',
          '-map [a]',
          '-c:v libx264',
          '-preset fast',
          '-c:a aac',
          '-movflags +faststart',
        ])
        .on('start', (cmd) => this.logger.debug(`ffmpeg stitch: ${cmd}`))
        .on('error', (err) => {
          this.logger.error(`ffmpeg stitch failed: ${err.message}`);
          reject(err);
        })
        .on('end', () => resolve())
        .save(outPath);
    });
  }

  /** Escape a Windows path so ffmpeg's filter chain doesn't choke on backslashes/colons. */
  private escapeForFilter(p: string): string {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
  }
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}
