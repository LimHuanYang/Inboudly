import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export interface ProviderTestResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
  modelUsed?: string;
}

/**
 * Pings each AI provider's API with a tiny test prompt to verify the key works.
 * Used by the Settings UI's "Test" button so users can confirm a saved key
 * actually works before relying on it in the composer.
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

  async testAnthropic(apiKey: string, model: string): Promise<ProviderTestResult> {
    const start = Date.now();
    try {
      const client = new Anthropic({ apiKey });
      const res = await client.messages.create({
        model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      });
      const block = res.content.find((c) => c.type === 'text');
      const text = block?.type === 'text' ? block.text : '';
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

  async testOpenAi(apiKey: string, model: string): Promise<ProviderTestResult> {
    const start = Date.now();
    try {
      const client = new OpenAI({ apiKey });
      // We can't generate an image just to test (slow + costs money), so use
      // the models.list endpoint — proves the key auths against OpenAI.
      const list = await client.models.list();
      const found = list.data.some((m) => m.id === model || m.id.startsWith('gpt-image'));
      return {
        ok: true,
        latencyMs: Date.now() - start,
        modelUsed: model,
        message: found
          ? `Authenticated · ${list.data.length} models available`
          : `Authenticated, but model "${model}" not in account model list`,
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
