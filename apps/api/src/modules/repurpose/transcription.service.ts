import { Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'fs';
import OpenAI from 'openai';

export interface TranscriptSegment {
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
 * BYOK Whisper transcription. The repurpose worker decrypts the workspace's
 * OpenAI key from WorkspaceAiCredentials and passes it in per job.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  async transcribe(apiKey: string, localFilePath: string, language?: string): Promise<Transcript> {
    this.logger.log(`Transcribing ${localFilePath}`);
    const client = new OpenAI({ apiKey });

    const res = await client.audio.transcriptions.create({
      file: createReadStream(localFilePath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language,
    });

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
