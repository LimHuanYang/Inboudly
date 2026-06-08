import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrismaService } from '../../common/prisma/prisma.service';
import { R2StorageService } from '../media/r2-storage.service';
import { FfmpegService } from '../repurpose/ffmpeg.service';

export interface VideoExportPayload {
  projectId: string;
}

@Processor('video-export')
export class VideoExportProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {
    super();
  }

  async process(job: Job<VideoExportPayload>): Promise<void> {
    const { projectId } = job.data;

    // Load scenes ordered by `order`, filter to those with a videoUrl
    const scenes = await this.prisma.videoScene.findMany({
      where: { projectId, videoUrl: { not: null } },
      orderBy: { order: 'asc' },
    });

    if (scenes.length === 0) {
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          exportStatus: 'FAILED',
          errorMessage: 'No scene videos to export',
        },
      });
      return;
    }

    const tempPaths: string[] = [];
    const outPath = join(tmpdir(), `inb-export-${projectId}-${Date.now()}.mp4`);

    try {
      // Download each scene clip to a temp file
      for (const scene of scenes) {
        const tempPath = join(tmpdir(), `inb-scene-${projectId}-${scene.order}-${Date.now()}.mp4`);
        tempPaths.push(tempPath);

        const response = await axios.get<ArrayBuffer>(scene.videoUrl as string, {
          responseType: 'arraybuffer',
        });
        await writeFile(tempPath, Buffer.from(response.data));
      }

      // Stitch all clips into one MP4
      await this.ffmpeg.stitchClips(tempPaths, outPath);

      // Read the stitched file and upload to R2
      const fileBuffer = await readFile(outPath);
      const key = `videos/${projectId}/final-${Date.now()}.mp4`;
      const publicUrl = await this.r2.putObject(key, fileBuffer, 'video/mp4');

      // Mark project READY with the final URL
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          exportStatus: 'READY',
          finalUrl: publicUrl,
          errorMessage: null,
        },
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Video export failed for project ${projectId}: ${message}`);
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          exportStatus: 'FAILED',
          errorMessage: message,
        },
      });
    } finally {
      // Clean up all temp files
      const cleanupPaths = [...tempPaths, outPath];
      for (const p of cleanupPaths) {
        unlink(p).catch(() => {
          // ignore — file may not exist if stitch failed early
        });
      }
    }
  }
}
