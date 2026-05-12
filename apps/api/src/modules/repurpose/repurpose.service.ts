import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { RepurposeRequest } from '@inboudly/shared';

/**
 * Repurpose Engine
 *
 * Pipeline (research-grounded — see arXiv 2512.11399 "Minimal Clips, Maximum Salience"):
 *  1. Ingest source: file upload | YouTube URL | podcast URL | blog URL
 *  2. Transcribe with Whisper
 *  3. Segment transcript into 20-sec windows, caption each
 *  4. LLM (Claude) selects highest-salience moments per target platform
 *  5. FFmpeg cuts + reframes (smart subject tracking) for each aspect ratio
 *  6. Burn-in captions in brand styling
 *  7. Register clip MediaAssets with parent reference
 *  8. Optionally create Post drafts for each clip on each target platform
 *
 * Phase 1 ships the queue + job model + endpoint. Worker implementation
 * (Whisper + FFmpeg + Claude clip selection) is the Week 3 deep dive.
 */
@Injectable()
export class RepurposeService {
  constructor(@InjectQueue('repurpose') private queue: Queue) {}

  async submit(req: RepurposeRequest) {
    const job = await this.queue.add('repurpose', req, {
      attempts: 2,
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });
    return { jobId: job.id, status: 'QUEUED' };
  }

  async status(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return { status: 'NOT_FOUND' };
    const state = await job.getState();
    return { status: state, progress: job.progress, returnValue: job.returnvalue };
  }
}
