import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PineconeService } from '../../common/pinecone/pinecone.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import type { SocialPlatform } from '@inboudly/shared';

interface TrainingExample {
  /** Raw caption text the AI should learn the voice from */
  text: string;
  /** Optional metadata to bias retrieval — platform/topic/performance */
  platform?: SocialPlatform;
  topic?: string;
  /** Engagement signal — high-performing posts get retrieval boost */
  engagementScore?: number;
  sourcePostId?: string;
}

/**
 * Brand Voice Training
 *
 * Workflow:
 *  1. User pastes past posts (or we pull from connected social accounts)
 *  2. We embed each example with text-embedding-3-large
 *  3. Store in Pinecone under the BrandVoice's namespace
 *  4. At generation time, retrieve top-K similar examples and include them
 *     in the Claude system prompt as in-context exemplars
 *
 * Research basis: in-context learning + RAG produces brand-voice fidelity that
 * fine-tuning struggles to match for short-form text, at a fraction of the cost.
 */
@Injectable()
export class VoiceTrainingService {
  private readonly logger = new Logger(VoiceTrainingService.name);

  constructor(
    private prisma: PrismaService,
    private pinecone: PineconeService,
    private embeddings: EmbeddingsService,
  ) {}

  async ingest(brandVoiceId: string, examples: TrainingExample[]) {
    if (examples.length === 0) return { ingested: 0 };

    const voice = await this.prisma.brandVoice.findUnique({ where: { id: brandVoiceId } });
    if (!voice) throw new NotFoundException('Brand voice not found');

    if (!this.pinecone.isConfigured()) {
      this.logger.warn('Pinecone not configured — voice training disabled. Examples ignored.');
      return { ingested: 0, warning: 'Pinecone not configured' };
    }

    const vectors = await this.embeddings.embedMany(examples.map((e) => e.text));

    const upserts = examples.map((ex, i) => ({
      id: ex.sourcePostId ?? `${brandVoiceId}-${Date.now()}-${i}`,
      values: vectors[i]!,
      metadata: {
        text: ex.text.slice(0, 2000), // store text in metadata for retrieval display
        platform: ex.platform ?? 'UNKNOWN',
        topic: ex.topic ?? '',
        engagementScore: ex.engagementScore ?? 0,
        ingestedAt: Date.now(),
      },
    }));

    await this.pinecone.upsert(voice.embeddingNamespace, upserts);

    await this.prisma.brandVoice.update({
      where: { id: brandVoiceId },
      data: { trainedOnPostCount: { increment: examples.length } },
    });

    return { ingested: examples.length };
  }

  /**
   * Retrieve the top-K past posts most similar to the user's current intent.
   * Used by ClaudeTextService to ground generation in real brand voice.
   */
  async retrieveExamples(
    brandVoiceId: string,
    intent: string,
    topK = 5,
  ): Promise<Array<{ text: string; score: number; platform?: string; topic?: string }>> {
    if (!this.pinecone.isConfigured()) return [];

    const voice = await this.prisma.brandVoice.findUnique({ where: { id: brandVoiceId } });
    if (!voice || voice.trainedOnPostCount === 0) return [];

    const queryVec = await this.embeddings.embedOne(intent);
    const matches = await this.pinecone.query(voice.embeddingNamespace, queryVec, topK);

    return matches.map((m) => ({
      text: (m.metadata?.text as string) ?? '',
      score: m.score,
      platform: m.metadata?.platform as string | undefined,
      topic: m.metadata?.topic as string | undefined,
    }));
  }

  async clear(brandVoiceId: string) {
    const voice = await this.prisma.brandVoice.findUnique({ where: { id: brandVoiceId } });
    if (!voice) throw new NotFoundException();
    if (this.pinecone.isConfigured()) {
      await this.pinecone.deleteNamespace(voice.embeddingNamespace);
    }
    await this.prisma.brandVoice.update({
      where: { id: brandVoiceId },
      data: { trainedOnPostCount: 0 },
    });
    return { ok: true };
  }
}
