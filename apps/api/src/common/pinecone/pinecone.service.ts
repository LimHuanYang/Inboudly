import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pinecone, type Index } from '@pinecone-database/pinecone';

/**
 * Shared Pinecone client. One index for the whole platform; each Brand Voice
 * gets its own namespace inside that index (BrandVoice.embeddingNamespace).
 *
 * Index settings (configure once in the Pinecone console):
 *   - Name: INBOUDLY_PINECONE_INDEX  (default "inboudly-brand-voices")
 *   - Dimensions: 3072  (matches text-embedding-3-large)
 *   - Metric: cosine
 */
@Injectable()
export class PineconeService implements OnModuleInit {
  private readonly logger = new Logger(PineconeService.name);
  private client: Pinecone;
  private indexName: string;
  private indexCache: Index | null = null;

  async onModuleInit() {
    const apiKey = process.env.PINECONE_API_KEY;
    this.indexName = process.env.PINECONE_INDEX ?? 'inboudly-brand-voices';
    if (!apiKey) {
      this.logger.warn('PINECONE_API_KEY not set — vector features disabled');
      return;
    }
    this.client = new Pinecone({ apiKey });
  }

  private getIndex(): Index {
    if (!this.client) throw new Error('Pinecone client not initialized');
    if (!this.indexCache) this.indexCache = this.client.index(this.indexName);
    return this.indexCache;
  }

  /** Upsert one or more vectors into a brand-voice namespace. */
  async upsert(
    namespace: string,
    vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>,
  ) {
    const index = this.getIndex();
    // Pinecone's RecordMetadata type narrows values to primitives/arrays of
    // primitives — our caller-side Record<string, unknown> is broader.
    // The runtime accepts any JSON-serialisable value, so a cast is safe.
    await index.namespace(namespace).upsert(vectors as never);
  }

  /** Top-K similarity search inside a namespace. */
  async query(
    namespace: string,
    vector: number[],
    topK = 5,
  ): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
    const index = this.getIndex();
    const res = await index.namespace(namespace).query({
      vector,
      topK,
      includeMetadata: true,
    });
    return (res.matches ?? []).map((m) => ({
      id: m.id,
      score: m.score ?? 0,
      metadata: m.metadata as Record<string, unknown> | undefined,
    }));
  }

  async deleteNamespace(namespace: string) {
    const index = this.getIndex();
    await index.namespace(namespace).deleteAll();
  }

  isConfigured(): boolean {
    return !!this.client;
  }
}
