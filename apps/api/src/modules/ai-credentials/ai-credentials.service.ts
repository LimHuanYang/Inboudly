import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

export type ResolvedTextProvider = {
  provider: 'claude' | 'gemini';
  apiKey: string;
  model: string;
};

export type ResolvedImageProvider = {
  provider: 'openai' | 'gemini';
  apiKey: string;
  model: string;
};

export type AiProviderKeyName =
  | 'geminiKey'
  | 'openaiKey'
  | 'anthropicKey'
  | 'runwayKey'
  | 'klingKey'
  | 'elevenLabsKey'
  | 'sunoKey'
  | 'pineconeKey';

export type AiProviderModelName =
  | 'geminiModel'
  | 'geminiImageModel'
  | 'openaiModel'
  | 'anthropicModel';

const KEY_FIELDS: AiProviderKeyName[] = [
  'geminiKey',
  'openaiKey',
  'anthropicKey',
  'runwayKey',
  'klingKey',
  'elevenLabsKey',
  'sunoKey',
  'pineconeKey',
];

/** Default TEXT models when no user override is saved. */
export const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-image-1', // (openai is image-only here; kept for getModel uniformity)
  anthropic: 'claude-sonnet-4-6',
} as const;

/** Default IMAGE models when no user override is saved. */
export const DEFAULT_IMAGE_MODELS = {
  openai: 'gpt-image-1',
  gemini: 'gemini-2.5-flash-image', // "Nano Banana"
} as const;

interface ProviderStateView {
  configured: boolean;
  masked: string | null;
  model: string | null; // user override; null = use default
}

export interface AiCredentialsView {
  gemini:     ProviderStateView;
  openai:     ProviderStateView;
  anthropic:  ProviderStateView;
  // Gemini's IMAGE model override (separate from gemini.model which is text).
  geminiImageModel: string | null;
  runway:     { configured: boolean; masked: string | null };
  kling:      { configured: boolean; masked: string | null };
  elevenLabs: { configured: boolean; masked: string | null };
  suno:       { configured: boolean; masked: string | null };
  pinecone:   { configured: boolean; masked: string | null };
  preferredTextProvider:  'claude' | 'gemini' | null;
  preferredImageProvider: 'openai' | 'gemini' | null;
}

@Injectable()
export class AiCredentialsService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
  ) {}

  async getDecryptedKey(workspaceId: string, field: AiProviderKeyName): Promise<string | null> {
    const row = await this.prisma.workspaceAiCredentials.findUnique({
      where: { workspaceId },
    });
    if (!row) return null;
    const ciphertext = row[field];
    if (!ciphertext) return null;
    try {
      return this.encryption.decrypt(ciphertext);
    } catch {
      return null;
    }
  }

  /** Get the user's chosen model for a provider, falling back to the default. */
  async getModel(
    workspaceId: string,
    provider: 'gemini' | 'openai' | 'anthropic',
  ): Promise<string> {
    const row = await this.prisma.workspaceAiCredentials.findUnique({
      where: { workspaceId },
    });
    const field = `${provider}Model` as AiProviderModelName;
    const custom = row?.[field];
    return custom?.trim() || DEFAULT_MODELS[provider];
  }

  /**
   * Image model for a provider. Gemini's image model lives in its own field
   * (geminiImageModel) because geminiModel is the TEXT model. OpenAI's image
   * model is openaiModel (OpenAI is image-only here).
   */
  async getImageModel(
    workspaceId: string,
    provider: 'openai' | 'gemini',
  ): Promise<string> {
    const row = await this.getRecord(workspaceId);
    const field: AiProviderModelName = provider === 'openai' ? 'openaiModel' : 'geminiImageModel';
    const custom = row?.[field];
    return custom?.trim() || DEFAULT_IMAGE_MODELS[provider];
  }

  async getRecord(workspaceId: string) {
    return this.prisma.workspaceAiCredentials.findUnique({ where: { workspaceId } });
  }

  /**
   * Single source of truth for "which text AI should we use for this workspace?"
   * Used by AiController (Composer), CompetitorAnalysisService (gap analysis),
   * and any future feature that needs to generate text.
   *
   * Resolution order:
   *   1. Workspace's preferred provider if its key is configured
   *   2. Anthropic key if available
   *   3. Gemini key if available
   *   4. null (caller decides: throw or return graceful error)
   *
   * Returns the matching model (user override OR default) so callers don't
   * have to make a second roundtrip.
   */
  async resolveTextProvider(workspaceId: string): Promise<ResolvedTextProvider | null> {
    const record = await this.getRecord(workspaceId);
    const claudeKey = await this.getDecryptedKey(workspaceId, 'anthropicKey');
    const geminiKey = await this.getDecryptedKey(workspaceId, 'geminiKey');

    const preferred = record?.preferredTextProvider as 'claude' | 'gemini' | null | undefined;
    if (preferred === 'claude' && claudeKey) {
      return { provider: 'claude', apiKey: claudeKey, model: await this.getModel(workspaceId, 'anthropic') };
    }
    if (preferred === 'gemini' && geminiKey) {
      return { provider: 'gemini', apiKey: geminiKey, model: await this.getModel(workspaceId, 'gemini') };
    }
    if (claudeKey) {
      return { provider: 'claude', apiKey: claudeKey, model: await this.getModel(workspaceId, 'anthropic') };
    }
    if (geminiKey) {
      return { provider: 'gemini', apiKey: geminiKey, model: await this.getModel(workspaceId, 'gemini') };
    }
    return null;
  }

  /** Same as resolveTextProvider but throws 400 if no provider is configured. */
  async requireTextProvider(workspaceId: string): Promise<ResolvedTextProvider> {
    const resolved = await this.resolveTextProvider(workspaceId);
    if (!resolved) {
      throw new BadRequestException(
        'No text AI provider configured for this workspace. Go to Settings → AI Providers and add either an Anthropic (Claude) or Google (Gemini) API key.',
      );
    }
    return resolved;
  }

  /**
   * Image-generation equivalent of resolveTextProvider. Honours
   * preferredImageProvider, falls back OpenAI > Gemini, and returns the
   * provider's image model so callers don't make a second roundtrip.
   */
  async resolveImageProvider(workspaceId: string): Promise<ResolvedImageProvider | null> {
    const record = await this.getRecord(workspaceId);
    const openaiKey = await this.getDecryptedKey(workspaceId, 'openaiKey');
    const geminiKey = await this.getDecryptedKey(workspaceId, 'geminiKey');

    const pick = async (provider: 'openai' | 'gemini', apiKey: string): Promise<ResolvedImageProvider> => ({
      provider,
      apiKey,
      model: await this.getImageModel(workspaceId, provider),
    });

    const preferred = record?.preferredImageProvider as 'openai' | 'gemini' | null | undefined;
    if (preferred === 'openai' && openaiKey) return pick('openai', openaiKey);
    if (preferred === 'gemini' && geminiKey) return pick('gemini', geminiKey);
    if (openaiKey) return pick('openai', openaiKey);
    if (geminiKey) return pick('gemini', geminiKey);
    return null;
  }

  /** Same as resolveImageProvider but throws 400 if no provider is configured. */
  async requireImageProvider(workspaceId: string): Promise<ResolvedImageProvider> {
    const resolved = await this.resolveImageProvider(workspaceId);
    if (!resolved) {
      throw new BadRequestException(
        'No image AI provider configured for this workspace. Go to Settings → AI Providers and add either an OpenAI or Google (Gemini) API key. Note: Gemini image generation requires paid Google Cloud billing.',
      );
    }
    return resolved;
  }

  async view(workspaceId: string): Promise<AiCredentialsView> {
    const row = await this.prisma.workspaceAiCredentials.findUnique({
      where: { workspaceId },
    });

    const safeKey = (field: AiProviderKeyName) => {
      const ct = row?.[field];
      if (!ct) return { configured: false, masked: null };
      try {
        const plain = this.encryption.decrypt(ct);
        return { configured: true, masked: this.encryption.mask(plain) };
      } catch {
        return { configured: false, masked: null };
      }
    };

    const safeProvider = (
      keyField: AiProviderKeyName,
      modelField: AiProviderModelName,
    ): ProviderStateView => ({
      ...safeKey(keyField),
      model: (row?.[modelField] as string | null) ?? null,
    });

    return {
      gemini:     safeProvider('geminiKey', 'geminiModel'),
      openai:     safeProvider('openaiKey', 'openaiModel'),
      anthropic:  safeProvider('anthropicKey', 'anthropicModel'),
      geminiImageModel: (row?.geminiImageModel as string | null) ?? null,
      runway:     safeKey('runwayKey'),
      kling:      safeKey('klingKey'),
      elevenLabs: safeKey('elevenLabsKey'),
      suno:       safeKey('sunoKey'),
      pinecone:   safeKey('pineconeKey'),
      preferredTextProvider:  (row?.preferredTextProvider as 'claude' | 'gemini' | null) ?? null,
      preferredImageProvider: (row?.preferredImageProvider as 'openai' | 'gemini' | null) ?? null,
    };
  }

  async upsertKey(
    workspaceId: string,
    field: AiProviderKeyName,
    plaintextKey: string,
  ): Promise<void> {
    const ciphertext = this.encryption.encrypt(plaintextKey.trim());
    await this.prisma.workspaceAiCredentials.upsert({
      where: { workspaceId },
      update: { [field]: ciphertext },
      create: { workspaceId, [field]: ciphertext },
    });
  }

  async upsertModel(
    workspaceId: string,
    field: AiProviderModelName,
    model: string | null,
  ): Promise<void> {
    const cleaned = model?.trim() || null;
    await this.prisma.workspaceAiCredentials.upsert({
      where: { workspaceId },
      update: { [field]: cleaned },
      create: { workspaceId, [field]: cleaned },
    });
  }

  async deleteKey(workspaceId: string, field: AiProviderKeyName): Promise<void> {
    const row = await this.prisma.workspaceAiCredentials.findUnique({
      where: { workspaceId },
    });
    if (!row) return;
    await this.prisma.workspaceAiCredentials.update({
      where: { workspaceId },
      data: { [field]: null },
    });
  }

  async setPreferences(
    workspaceId: string,
    prefs: {
      preferredTextProvider?: 'claude' | 'gemini' | null;
      preferredImageProvider?: 'openai' | 'gemini' | null;
    },
  ): Promise<void> {
    await this.prisma.workspaceAiCredentials.upsert({
      where: { workspaceId },
      update: prefs,
      create: { workspaceId, ...prefs },
    });
  }

  async clearAll(workspaceId: string): Promise<void> {
    const reset: Record<string, null> = Object.fromEntries(
      KEY_FIELDS.map((f) => [f, null]),
    );
    reset.preferredTextProvider = null;
    reset.preferredImageProvider = null;
    await this.prisma.workspaceAiCredentials
      .update({ where: { workspaceId }, data: reset as never })
      .catch(() => {
        throw new NotFoundException('No credentials to clear');
      });
  }
}
