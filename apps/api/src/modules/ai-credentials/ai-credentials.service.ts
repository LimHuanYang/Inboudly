import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

// NOTE: the BYOK surface is now two vendors only — Gemini (text + image +
// embeddings) and Higgsfield (video). Pinecone stays for the brand-voice moat.
// The `provider` union below keeps 'claude' as a *type* member (never returned
// at runtime) only so legacy provider-branching call sites still type-check;
// resolveTextProvider always resolves to 'gemini'.
export type ResolvedTextProvider = {
  provider: 'claude' | 'gemini';
  apiKey: string;
  model: string;
};

export type ResolvedImageProvider = {
  provider: 'gemini';
  apiKey: string;
  model: string;
};

export type VideoProviderName = 'higgsfield' | 'hyperframes';

export type ResolvedVideoProvider = {
  provider: VideoProviderName;
  apiKey: string; // '' when no Higgsfield key is configured yet
  model: string;
};

export type AiProviderKeyName = 'geminiKey' | 'higgsfieldKey' | 'pineconeKey';

export type AiProviderModelName = 'geminiModel' | 'geminiImageModel';

const KEY_FIELDS: AiProviderKeyName[] = ['geminiKey', 'higgsfieldKey', 'pineconeKey'];

/** Default Gemini TEXT model when no user override is saved. */
export const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
} as const;

/** Default Gemini IMAGE model when no user override is saved. */
export const DEFAULT_IMAGE_MODELS = {
  gemini: 'gemini-2.5-flash-image', // "Nano Banana"
} as const;

/** Default VIDEO models when no user override is saved. */
export const DEFAULT_VIDEO_MODELS: Record<VideoProviderName, string> = {
  higgsfield: 'higgsfield',
  hyperframes: 'hyperframes',
} as const;

/** Providers with a working adapter in THIS build. */
export const IMPLEMENTED_VIDEO_PROVIDERS: VideoProviderName[] = ['higgsfield', 'hyperframes'];

interface ProviderStateView {
  configured: boolean;
  masked: string | null;
  model: string | null; // user override; null = use default
}

export interface AiCredentialsView {
  gemini: ProviderStateView;
  // Gemini's IMAGE model override (separate from gemini.model which is text).
  geminiImageModel: string | null;
  higgsfield: { configured: boolean; masked: string | null };
  pinecone: { configured: boolean; masked: string | null };
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

  /** Get the user's chosen Gemini TEXT model, falling back to the default. */
  async getModel(workspaceId: string, provider: 'gemini'): Promise<string> {
    const row = await this.prisma.workspaceAiCredentials.findUnique({
      where: { workspaceId },
    });
    const custom = row?.geminiModel;
    return custom?.trim() || DEFAULT_MODELS[provider];
  }

  /**
   * Gemini IMAGE model. Lives in its own field (geminiImageModel) because
   * geminiModel is the TEXT model.
   */
  async getImageModel(workspaceId: string, provider: 'gemini'): Promise<string> {
    const row = await this.getRecord(workspaceId);
    const custom = row?.geminiImageModel;
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
   * BYOK is Gemini-only now, so this resolves to Gemini when its key is set,
   * else null (caller decides: throw or return graceful error). Returns the
   * matching model (user override OR default) so callers don't have to make a
   * second roundtrip.
   */
  async resolveTextProvider(workspaceId: string): Promise<ResolvedTextProvider | null> {
    const geminiKey = await this.getDecryptedKey(workspaceId, 'geminiKey');
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
        'No text AI provider configured for this workspace. Go to Settings → AI Providers, add a Google (Gemini) key.',
      );
    }
    return resolved;
  }

  /**
   * Image-generation equivalent of resolveTextProvider. Gemini-only: resolves
   * to Gemini when its key is set, else null.
   */
  async resolveImageProvider(workspaceId: string): Promise<ResolvedImageProvider | null> {
    const geminiKey = await this.getDecryptedKey(workspaceId, 'geminiKey');
    if (geminiKey) {
      return { provider: 'gemini', apiKey: geminiKey, model: await this.getImageModel(workspaceId, 'gemini') };
    }
    return null;
  }

  /** Same as resolveImageProvider but throws 400 if Gemini isn't configured. */
  async requireImageProvider(workspaceId: string): Promise<ResolvedImageProvider> {
    const resolved = await this.resolveImageProvider(workspaceId);
    if (!resolved) {
      throw new BadRequestException(
        'No image AI provider configured for this workspace. Go to Settings → AI Providers, add a Google (Gemini) key.',
      );
    }
    return resolved;
  }

  /**
   * Video model for a provider. Higgsfield has no override field, so this
   * always returns the default.
   */
  async getVideoModel(workspaceId: string, provider: VideoProviderName): Promise<string> {
    return DEFAULT_VIDEO_MODELS[provider];
  }

  /**
   * Video equivalent of resolveImageProvider. Higgsfield is the only provider;
   * resolves to it with the workspace's higgsfieldKey (or '' if not yet set, so
   * the runner surfaces a clear "add your Higgsfield key" error).
   */
  async resolveVideoProvider(
    workspaceId: string,
    _override?: VideoProviderName,
  ): Promise<ResolvedVideoProvider> {
    const apiKey = (await this.getDecryptedKey(workspaceId, 'higgsfieldKey')) ?? '';
    return {
      provider: 'higgsfield',
      apiKey,
      model: await this.getVideoModel(workspaceId, 'higgsfield'),
    };
  }

  /** Alias for symmetry. */
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

    return {
      gemini: { ...safeKey('geminiKey'), model: (row?.geminiModel as string | null) ?? null },
      geminiImageModel: (row?.geminiImageModel as string | null) ?? null,
      higgsfield: safeKey('higgsfieldKey'),
      pinecone: safeKey('pineconeKey'),
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

  async clearAll(workspaceId: string): Promise<void> {
    const reset: Record<string, null> = Object.fromEntries(
      KEY_FIELDS.map((f) => [f, null]),
    );
    await this.prisma.workspaceAiCredentials
      .update({ where: { workspaceId }, data: reset as never })
      .catch(() => {
        throw new NotFoundException('No credentials to clear');
      });
  }
}
