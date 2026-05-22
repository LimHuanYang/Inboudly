import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

export type AiProviderKeyName =
  | 'geminiKey'
  | 'openaiKey'
  | 'anthropicKey'
  | 'runwayKey'
  | 'klingKey'
  | 'elevenLabsKey'
  | 'sunoKey'
  | 'pineconeKey';

export type AiProviderModelName = 'geminiModel' | 'openaiModel' | 'anthropicModel';

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

/** Default models when no user override is saved. */
export const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-image-1', // image gen default
  anthropic: 'claude-sonnet-4-6',
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

  async getRecord(workspaceId: string) {
    return this.prisma.workspaceAiCredentials.findUnique({ where: { workspaceId } });
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
