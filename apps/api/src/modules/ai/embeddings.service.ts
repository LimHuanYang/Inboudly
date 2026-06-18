import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { EmbedContentRequest, BatchEmbedContentsRequest } from '@google/generative-ai';

/**
 * BYOK embeddings via Gemini gemini-embedding-001 (3072 dim, matches the
 * existing Pinecone index `inboudly-brand-voices`). Accepts the workspace's
 * Gemini API key. No client caching — different workspaces use different keys.
 */
@Injectable()
export class EmbeddingsService {
  static readonly MODEL = 'gemini-embedding-001';
  static readonly DIMENSION = 3072;

  async embedOne(apiKey: string, text: string): Promise<number[]> {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: EmbeddingsService.MODEL,
    });
    // outputDimensionality is a valid REST param but missing from the v0.21.0
    // SDK types, so we widen only that field rather than casting the whole request.
    const res = await model.embedContent({
      content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EmbeddingsService.DIMENSION,
    } as EmbedContentRequest & { outputDimensionality?: number });
    const values = res.embedding.values;
    if (values.length !== EmbeddingsService.DIMENSION) {
      throw new Error(`Unexpected embedding dimension: got ${values.length}, expected ${EmbeddingsService.DIMENSION}`);
    }
    return values;
  }

  async embedMany(apiKey: string, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: EmbeddingsService.MODEL,
    });
    const all: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      // outputDimensionality is a valid REST param but missing from the v0.21.0
      // SDK types, so we widen only that field rather than casting the whole request.
      const res = await model.batchEmbedContents({
        requests: batch.map((t) => ({
          content: { role: 'user', parts: [{ text: t.slice(0, 8000) }] },
          outputDimensionality: EmbeddingsService.DIMENSION,
        })),
      } as BatchEmbedContentsRequest);
      for (const e of res.embeddings) {
        if (e.values.length !== EmbeddingsService.DIMENSION) {
          throw new Error(`Unexpected embedding dimension: got ${e.values.length}, expected ${EmbeddingsService.DIMENSION}`);
        }
        all.push(e.values);
      }
    }
    return all;
  }
}
