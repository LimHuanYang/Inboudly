import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ProviderTestResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
  modelUsed?: string;
}

/**
 * Pings the AI provider's API with a tiny test prompt to verify the key works.
 * BYOK is Gemini-only for text/image, so only Gemini has a test here. Used by
 * the Settings UI's "Test" button so users can confirm a saved key actually
 * works before relying on it in the composer.
 */
@Injectable()
export class ProviderTestService {
  private readonly logger = new Logger(ProviderTestService.name);

  async testGemini(apiKey: string, model: string): Promise<ProviderTestResult> {
    const start = Date.now();
    try {
      const client = new GoogleGenerativeAI(apiKey);
      const m = client.getGenerativeModel({ model });
      const res = await m.generateContent('Reply with the single word OK.');
      const text = res.response.text();
      return {
        ok: text.toLowerCase().includes('ok'),
        latencyMs: Date.now() - start,
        modelUsed: model,
        message: text.slice(0, 80),
      };
    } catch (err) {
      return this.errorResult(err, model, start);
    }
  }

  private errorResult(err: unknown, model: string, start: number): ProviderTestResult {
    const message = err instanceof Error ? err.message : String(err);
    // Trim long stack-y messages to keep the toast readable.
    const trimmed = message.split('\n')[0]?.slice(0, 200) ?? 'Unknown error';
    return {
      ok: false,
      latencyMs: Date.now() - start,
      modelUsed: model,
      message: trimmed,
    };
  }
}
