import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * OpenAI text-embedding-3-large (3072 dim).
 *
 * We use the large model for brand voice fidelity — captures subtle tonal
 * differences (formal vs. punchy, "we" vs. "I", emoji density) that the small
 * model loses. The cost difference is negligible for our usage volume.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private client: OpenAI;
  static readonly MODEL = 'text-embedding-3-large';
  static readonly DIMENSION = 3072;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async embedOne(text: string): Promise<number[]> {
    const trimmed = text.slice(0, 8000); // model limit ~8191 tokens; chars > tokens is safe
    const res = await this.client.embeddings.create({
      model: EmbeddingsService.MODEL,
      input: trimmed,
    });
    return res.data[0]!.embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    // OpenAI accepts batch input. Cap at 100 per request to stay safe.
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += 100) batches.push(texts.slice(i, i + 100));

    const all: number[][] = [];
    for (const batch of batches) {
      const res = await this.client.embeddings.create({
        model: EmbeddingsService.MODEL,
        input: batch.map((t) => t.slice(0, 8000)),
      });
      for (const item of res.data) all.push(item.embedding);
    }
    return all;
  }
}
