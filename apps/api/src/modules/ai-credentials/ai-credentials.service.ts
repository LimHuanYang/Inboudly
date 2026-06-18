import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

export type ResolvedTextProvider = {
  provider: 'claude' | 'gemini';
  apiKey: string;
  model: string;
};

export type ResolvedImageProvider = {
  provider: 'openai' | 'gemini' | 'pollinations';
  // Empty string for keyless providers (Pollinations).
  apiKey: string;
  model: string;
};

export type VideoProviderName = 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo';

export type ResolvedVideoProvider = {
  provider: VideoProviderName;
  apiKey: string; // '' for keyless / demo
  model: string;
};

export type AiProviderKeyName =
  | 'geminiKey'
  | 'openaiKey'
  | 'anthropicKey'
  | 'runwayKey'
  | 'klingKey'
  | 'pollinationsKey'
  | 'elevenLabsKey'
  | 'sunoKey'
  | 'pineconeKey';

export type AiProviderModelName =
  | 'geminiModel'
  | 'geminiImageModel'
  | 'openaiModel'
  | 'anthropicModel'
  | 'pollinationsModel'
  | 'pollinationsVideoModel'
  | 'runwayModel'
  | 'klingModel'
  | 'veoVideoModel';

const KEY_FIELDS: AiProviderKeyName[] = [
  'geminiKey',
  'openaiKey',
  'anthropicKey',
  'runwayKey',
  'klingKey',
  'pollinationsKey',
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
  pollinations: 'flux', // free, keyless
} as const;

/** Default VIDEO models when no user override is saved. */
export const DEFAULT_VIDEO_MODELS: Record<VideoProviderName, string> = {
  demo: 'demo',
  pollinations: 'seedance',
  runway: 'runway-gen3',
  kling: 'kling-v2',
  veo: 'veo-3',
} as const;

/** Providers with a working adapter in THIS build. */
export const IMPLEMENTED_VIDEO_PROVIDERS: VideoProviderName[] = [
  'demo', 'pollinations', 'runway', 'kling', 'veo',
];

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
  // Pollinations IMAGE model override (free, keyless provider).
  pollinationsModel: string | null;
  pollinationsVideoModel: string | null;
  runwayModel: string | null;
  klingModel: string | null;
  veoVideoModel: string | null;
  runway:     { configured: boolean; masked: string | null };
  kling:      { configured: boolean; masked: string | null };
  pollinations: { configured: boolean; masked: string | null };
  elevenLabs: { configured: boolean; masked: string | null };
  suno:       { configured: boolean; masked: string | null };
  pinecone:   { configured: boolean; masked: string | null };
  preferredTextProvider:  'claude' | 'gemini' | null;
  preferredImageProvider: 'openai' | 'gemini' | 'pollinations' | null;
  preferredVideoProvider: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
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
    provider: 'openai' | 'gemini' | 'pollinations',
  ): Promise<string> {
    const row = await this.getRecord(workspaceId);
    const field: AiProviderModelName =
      provider === 'openai' ? 'openaiModel'
        : provider === 'gemini' ? 'geminiImageModel'
          : 'pollinationsModel';
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
   * preferredImageProvider, then falls back OpenAI > Gemini > Pollinations.
   * Pollinations is free and keyless, so this ALWAYS resolves — a workspace
   * can generate images at $0 before adding any paid provider key.
   */
  async resolveImageProvider(workspaceId: string): Promise<ResolvedImageProvider> {
    const record = await this.getRecord(workspaceId);
    const openaiKey = await this.getDecryptedKey(workspaceId, 'openaiKey');
    const geminiKey = await this.getDecryptedKey(workspaceId, 'geminiKey');

    const pick = async (
      provider: ResolvedImageProvider['provider'],
      apiKey: string,
    ): Promise<ResolvedImageProvider> => ({
      provider,
      apiKey,
      model: await this.getImageModel(workspaceId, provider),
    });

    const preferred = record?.preferredImageProvider as
      | 'openai' | 'gemini' | 'pollinations' | null | undefined;
    if (preferred === 'pollinations') return pick('pollinations', '');
    if (preferred === 'openai' && openaiKey) return pick('openai', openaiKey);
    if (preferred === 'gemini' && geminiKey) return pick('gemini', geminiKey);
    if (openaiKey) return pick('openai', openaiKey);
    if (geminiKey) return pick('gemini', geminiKey);
    // Free, keyless fallback so image gen works without any configured key.
    return pick('pollinations', '');
  }

  /**
   * Alias of resolveImageProvider. Pollinations guarantees a provider is always
   * available, so this never throws — kept for call-site symmetry with
   * requireTextProvider.
   */
  async requireImageProvider(workspaceId: string): Promise<ResolvedImageProvider> {
    return this.resolveImageProvider(workspaceId);
  }

  /**
   * Video model for a provider. Demo is a fixed clip (no override field), so it
   * always returns the default. Veo uses the Google/Gemini key but its own model
   * field (veoVideoModel).
   */
  async getVideoModel(workspaceId: string, provider: VideoProviderName): Promise<string> {
    const row = await this.getRecord(workspaceId);
    const field: AiProviderModelName | null =
      provider === 'pollinations' ? 'pollinationsVideoModel'
        : provider === 'runway' ? 'runwayModel'
          : provider === 'kling' ? 'klingModel'
            : provider === 'veo' ? 'veoVideoModel'
              : null; // demo
    const custom = field ? (row?.[field] as string | null) : null;
    return custom?.trim() || DEFAULT_VIDEO_MODELS[provider];
  }

  /**
   * Video equivalent of resolveImageProvider. Demo is keyless and always
   * available, so this NEVER throws. Honours an explicit per-request override
   * first, then the saved preferredVideoProvider — but only for providers that
   * (a) have a working adapter in this build and (b) have their key when keyed.
   * Everything else falls back to the always-works Demo provider.
   */
  async resolveVideoProvider(
    workspaceId: string,
    override?: VideoProviderName,
  ): Promise<ResolvedVideoProvider> {
    const record = await this.getRecord(workspaceId);
    const preferred = (override ?? (record?.preferredVideoProvider as VideoProviderName | null))
      ?? undefined;

    // Each paid provider uses its own per-provider API key. Veo runs on the
    // Gemini API key via AI Studio's Veo endpoint (not Vertex AI).
    const keyFieldFor: Partial<Record<VideoProviderName, AiProviderKeyName>> = {
      pollinations: 'pollinationsKey',
      runway: 'runwayKey',
      kling:  'klingKey',
      veo:    'geminiKey',
    };

    const pick = async (provider: VideoProviderName, apiKey: string): Promise<ResolvedVideoProvider> => ({
      provider,
      apiKey,
      model: await this.getVideoModel(workspaceId, provider),
    });

    if (preferred && IMPLEMENTED_VIDEO_PROVIDERS.includes(preferred)) {
      if (preferred === 'demo') return pick(preferred, '');
      const keyField = keyFieldFor[preferred];
      const key = keyField ? await this.getDecryptedKey(workspaceId, keyField) : null;
      if (key) return pick(preferred, key);
    }

    // Always-works, zero-setup default.
    return pick('demo', '');
  }

  /** Alias for symmetry — Demo guarantees a provider, so this never throws. */
  async requireVideoProvider(
    workspaceId: string,
    override?: VideoProviderName,
  ): Promise<ResolvedVideoProvider> {
    return this.resolveVideoProvider(workspaceId, override);
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
      pollinationsModel: (row?.pollinationsModel as string | null) ?? null,
      pollinationsVideoModel: (row?.pollinationsVideoModel as string | null) ?? null,
      runwayModel: (row?.runwayModel as string | null) ?? null,
      klingModel: (row?.klingModel as string | null) ?? null,
      veoVideoModel: (row?.veoVideoModel as string | null) ?? null,
      runway:     safeKey('runwayKey'),
      kling:      safeKey('klingKey'),
      pollinations: safeKey('pollinationsKey'),
      elevenLabs: safeKey('elevenLabsKey'),
      suno:       safeKey('sunoKey'),
      pinecone:   safeKey('pineconeKey'),
      preferredTextProvider:  (row?.preferredTextProvider as 'claude' | 'gemini' | null) ?? null,
      preferredImageProvider: (row?.preferredImageProvider as 'openai' | 'gemini' | 'pollinations' | null) ?? null,
      preferredVideoProvider:
        (row?.preferredVideoProvider as 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null) ?? null,
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
      preferredImageProvider?: 'openai' | 'gemini' | 'pollinations' | null;
      preferredVideoProvider?: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
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
    reset.preferredVideoProvider = null;
    await this.prisma.workspaceAiCredentials
      .update({ where: { workspaceId }, data: reset as never })
      .catch(() => {
        throw new NotFoundException('No credentials to clear');
      });
  }
}
