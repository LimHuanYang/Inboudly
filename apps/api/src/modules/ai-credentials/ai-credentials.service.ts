import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';

/**
 * Names of every AI provider key column on WorkspaceAiCredentials.
 * Keep this in lock-step with the Prisma model.
 */
export type AiProviderKeyName =
  | 'geminiKey'
  | 'openaiKey'
  | 'anthropicKey'
  | 'runwayKey'
  | 'klingKey'
  | 'elevenLabsKey'
  | 'sunoKey'
  | 'pineconeKey';

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

export interface AiCredentialsView {
  // Per-key state shown to the UI: configured/null + safe masked preview only.
  gemini:     { configured: boolean; masked: string | null };
  openai:     { configured: boolean; masked: string | null };
  anthropic:  { configured: boolean; masked: string | null };
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

  /**
   * Decrypt and return the plaintext key for a specific provider, or null if
   * not configured for this workspace. Used by the AI controller to dispatch
   * requests using the right caller's credentials.
   */
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
      // Decryption fails when the master key was rotated/lost. Treat as not set.
      return null;
    }
  }

  /** Convenience: also returns the preferred provider hints alongside keys. */
  async getRecord(workspaceId: string) {
    return this.prisma.workspaceAiCredentials.findUnique({ where: { workspaceId } });
  }

  async view(workspaceId: string): Promise<AiCredentialsView> {
    const row = await this.prisma.workspaceAiCredentials.findUnique({
      where: { workspaceId },
    });

    const safe = (field: AiProviderKeyName) => {
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
      gemini:     safe('geminiKey'),
      openai:     safe('openaiKey'),
      anthropic:  safe('anthropicKey'),
      runway:     safe('runwayKey'),
      kling:      safe('klingKey'),
      elevenLabs: safe('elevenLabsKey'),
      suno:       safe('sunoKey'),
      pinecone:   safe('pineconeKey'),
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

  /** Bulk delete every saved key for a workspace. Used on "Disconnect all". */
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
