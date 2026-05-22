import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Encrypts user-provided secrets (AI API keys, OAuth tokens later) at rest.
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit key derived from the platform's ENCRYPTION_KEY env via scrypt
 *   - 96-bit random IV per encryption (NIST recommendation for GCM)
 *   - 128-bit auth tag prevents tampering
 *
 * Storage format (single string column):
 *   "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *
 * Master key requirement:
 *   ENCRYPTION_KEY must be a 32+ char random string in .env. NEVER commit it.
 *   If you lose it, all encrypted user keys become unrecoverable — users will
 *   have to re-enter them. Treat it like a password.
 *
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12;
  private static readonly KEY_LENGTH = 32;
  // Static salt is fine here — the master key already has 256+ bits of entropy.
  // We just use scrypt to deterministically widen short-but-strong inputs.
  private static readonly SALT = Buffer.from('inboudly-byok-v1');

  onModuleInit() {
    const masterKey = process.env.ENCRYPTION_KEY;
    if (!masterKey || masterKey.length < 32) {
      const generated = randomBytes(48).toString('base64');
      this.logger.error(
        'ENCRYPTION_KEY is missing or too short (< 32 chars). User API keys ' +
          'cannot be encrypted. Add this to .env:\n\n  ENCRYPTION_KEY="' +
          generated +
          '"\n',
      );
      throw new Error('ENCRYPTION_KEY env var is required (min 32 chars)');
    }
    this.key = scryptSync(masterKey, EncryptionService.SALT, EncryptionService.KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(EncryptionService.IV_LENGTH);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const [ivHex, tagHex, ctHex] = payload.split(':');
    if (!ivHex || !tagHex || !ctHex) {
      throw new Error('Invalid encrypted payload format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv(EncryptionService.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /** Returns just the last 4 chars of a key for safe display in the UI. */
  mask(plaintext: string): string {
    if (plaintext.length <= 8) return '••••';
    return `${plaintext.slice(0, 3)}…${plaintext.slice(-4)}`;
  }
}
