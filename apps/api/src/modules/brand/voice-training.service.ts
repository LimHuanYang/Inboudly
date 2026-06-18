import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PineconeService } from '../../common/pinecone/pinecone.service';
import { EmbeddingsService } from '../ai/embeddings.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import type { SocialPlatform } from '@inboudly/shared';

interface TrainingExample {
  text: string;
  platform?: SocialPlatform;
  topic?: string;
  engagementScore?: number;
  sourcePostId?: string;
}

/**
 * Brand Voice Training (BYOK)
 *
 * Embeddings use Gemini gemini-embedding-001, so this service needs the
 * workspace's Gemini key. Resolved per-call via AiCredentialsService.
 *
 * If the workspace has no Gemini key configured, training/retrieval gracefully
 * degrade — generation falls back to platform-spec-only prompts (no exemplars).
 */
@Injectable()
export class VoiceTrainingService {
  private readonly logger = new Logger(VoiceTrainingService.name);

  constructor(
    private prisma: PrismaService,
    private pinecone: PineconeService,
    private embeddings: EmbeddingsService,
    @Inject(forwardRef(() => AiCredentialsService))
    private credentials: AiCredentialsService,
  ) {}

  /** Resolves the workspace Gemini key for the brand voice's workspace. */
  private async getGeminiKeyForVoice(brandVoiceId: string): Promise<{
    workspaceId: string;
    geminiKey: string | null;
  } | null> {
    const voice = await this.prisma.brandVoice.findUnique({
      where: { id: brandVoiceId },
      select: { workspaceId: true },
    });
    if (!voice) return null;
    const geminiKey = await this.credentials.getDecryptedKey(voice.workspaceId, 'geminiKey');
    return { workspaceId: voice.workspaceId, geminiKey };
  }

  async ingest(brandVoiceId: string, examples: TrainingExample[]) {
    if (examples.length === 0) return { ingested: 0 };

    const voice = await this.prisma.brandVoice.findUnique({ where: { id: brandVoiceId } });
    if (!voice) throw new NotFoundException('Brand voice not found');

    if (!this.pinecone.isConfigured()) {
      this.logger.warn('Pinecone not configured — voice training disabled.');
      return { ingested: 0, warning: 'Pinecone not configured' };
    }

    const resolved = await this.getGeminiKeyForVoice(brandVoiceId);
    if (!resolved?.geminiKey) {
      return {
        ingested: 0,
        warning:
          'No Gemini API key in workspace — embeddings cannot be created. Add a key in Settings → AI Providers.',
      };
    }

    const vectors = await this.embeddings.embedMany(
      resolved.geminiKey,
      examples.map((e) => e.text),
    );

    const upserts = examples.map((ex, i) => ({
      id: ex.sourcePostId ?? `${brandVoiceId}-${Date.now()}-${i}`,
      values: vectors[i]!,
      metadata: {
        text: ex.text.slice(0, 2000),
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
   * Degrades gracefully: returns [] if Pinecone/Gemini key not configured.
   */
  async retrieveExamples(
    brandVoiceId: string,
    intent: string,
    topK = 5,
  ): Promise<Array<{ text: string; score: number; platform?: string; topic?: string }>> {
    if (!this.pinecone.isConfigured()) return [];

    const voice = await this.prisma.brandVoice.findUnique({ where: { id: brandVoiceId } });
    if (!voice || voice.trainedOnPostCount === 0) return [];

    const resolved = await this.getGeminiKeyForVoice(brandVoiceId);
    if (!resolved?.geminiKey) return [];

    const queryVec = await this.embeddings.embedOne(resolved.geminiKey, intent);
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
