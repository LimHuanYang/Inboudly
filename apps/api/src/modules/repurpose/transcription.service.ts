import { Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

export interface TranscriptSegment {
  /** Seconds from the start of the source */
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  language?: string;
  durationSec: number;
  fullText: string;
  segments: TranscriptSegment[];
}

/**
 * Whisper transcription via OpenAI's API.
 * Returns word-level timestamps so the clip selector can pick exact start/end
 * points for each clip without slicing mid-word.
 *
 * Model: whisper-1 (current GA). When OpenAI ships their next ASR model we
 * swap the model string and keep the rest unchanged.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async transcribe(localFilePath: string, language?: string): Promise<Transcript> {
    this.logger.log(`Transcribing ${localFilePath}`);

    const res = await this.client.audio.transcriptions.create({
      file: createReadStream(localFilePath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language,
    });

    // OpenAI's typed shape doesn't include `segments` on the verbose response,
    // so we cast through `unknown` to access them.
    const data = res as unknown as {
      text: string;
      language?: string;
      duration?: number;
      segments?: Array<{ start: number; end: number; text: string }>;
    };

    return {
      language: data.language,
      durationSec: data.duration ?? 0,
      fullText: data.text,
      segments: (data.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
      })),
    };
  }
}
