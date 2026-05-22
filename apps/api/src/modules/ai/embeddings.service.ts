import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * BYOK embeddings via OpenAI text-embedding-3-large (3072 dim).
 *
 * Each call accepts the workspace's OpenAI API key. We don't cache the
 * client because callers may be different workspaces using different keys.
 */
@Injectable()
export class EmbeddingsService {
  static readonly MODEL = 'text-embedding-3-large';
  static readonly DIMENSION = 3072;

  async embedOne(apiKey: string, text: string): Promise<number[]> {
    const client = new OpenAI({ apiKey });
    const trimmed = text.slice(0, 8000);
    const res = await client.embeddings.create({
      model: EmbeddingsService.MODEL,
      input: trimmed,
    });
    return res.data[0]!.embedding;
  }

  async embedMany(apiKey: string, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = new OpenAI({ apiKey });
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += 100) batches.push(texts.slice(i, i + 100));

    const all: number[][] = [];
    for (const batch of batches) {
      const res = await client.embeddings.create({
        model: EmbeddingsService.MODEL,
        input: batch.map((t) => t.slice(0, 8000)),
      });
      for (const item of res.data) all.push(item.embedding);
    }
    return all;
  }
}
