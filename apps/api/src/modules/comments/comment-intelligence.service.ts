import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import type { CommentIntent, CommentSentiment } from '@inboudly/database';

export type Urgency = 'low' | 'medium' | 'high';

export interface ClassifyResult {
  ok: boolean;
  commentId: string;
  intent: CommentIntent;
  sentiment: CommentSentiment;
  confidence: number; // 0.0-1.0
  urgency: Urgency;
  reasoning: string;
  modelUsed?: string;
  message?: string;
}

export interface ReplySuggestionResult {
  ok: boolean;
  intent: CommentIntent;
  sentiment: CommentSentiment;
  urgency: Urgency;
  suggestions: Array<{
    text: string;
    tone: string; // "warm", "direct", "playful", etc.
    rationale: string; // why this reply fits the intent + voice
  }>;
  modelUsed?: string;
  message?: string;
}

interface AiClassifyResponse {
  intent: CommentIntent;
  sentiment: CommentSentiment;
  confidence: number;
  reasoning: string;
}

interface AiReplyResponse {
  suggestions: Array<{ text: string; tone: string; rationale: string }>;
}

/**
 * Comment Intent AI v2 — replaces the Phase 1 stub classifier with real
 * AI-powered intent + sentiment + urgency detection + intent-aware reply
 * suggestions that respect the workspace's brand voice.
 *
 * BYOK via the shared resolveTextProvider — Claude or Gemini, user's choice.
 *
 * Urgency is COMPUTED, not stored (no schema migration needed):
 *   COMPLAINT + NEGATIVE → high
 *   PURCHASE_INTENT      → high
 *   QUESTION             → medium
 *   FAN_ENGAGEMENT       → low (but high if confidence < 0.6 — needs human check)
 *   SPAM                 → low (hide-worthy)
 *
 * Schema fields persisted on classify: intent, sentiment, intentConfidence.
 * Reasoning + urgency live in the response only (don't bloat the DB).
 */
@Injectable()
export class CommentIntelligenceService {
  private readonly logger = new Logger(CommentIntelligenceService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
  ) {}

  /**
   * Classify a single comment + persist intent/sentiment/confidence to the row.
   * Returns the full result including reasoning + derived urgency.
   */
  async classify(workspaceId: string, commentId: string): Promise<ClassifyResult> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, socialAccount: { workspaceId } },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const resolved = await this.credentials.resolveTextProvider(workspaceId);
    if (!resolved) {
      return this.failResult(commentId, comment.intent, comment.sentiment, comment.intentConfidence ?? 0,
        'Classification needs a text AI provider. Add an Anthropic (Claude) or Google (Gemini) API key in Settings → AI Providers.');
    }

    const prompt = this.buildClassifyPrompt(comment.body, comment.language ?? undefined);

    let raw: string;
    let modelUsed: string;
    try {
      ({ raw, modelUsed } = await this.runAi(resolved, prompt, 800, 0.2));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Classify failed (${resolved.provider}): ${msg}`);
      return this.failResult(commentId, comment.intent, comment.sentiment, comment.intentConfidence ?? 0,
        `${resolved.provider === 'claude' ? 'Claude' : 'Gemini'} request failed: ${msg}`,
        resolved.model);
    }

    const parsed = this.parseClassify(raw);
    if (!parsed) {
      return this.failResult(commentId, comment.intent, comment.sentiment, comment.intentConfidence ?? 0,
        'AI returned an unparseable response. Try again or switch provider.', modelUsed);
    }

    // Persist intent + sentiment + confidence — NOT reasoning (keep DB lean)
    await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        intent: parsed.intent,
        sentiment: parsed.sentiment,
        intentConfidence: parsed.confidence,
      },
    });

    return {
      ok: true,
      commentId,
      intent: parsed.intent,
      sentiment: parsed.sentiment,
      confidence: parsed.confidence,
      urgency: this.deriveUrgency(parsed.intent, parsed.sentiment, parsed.confidence),
      reasoning: parsed.reasoning,
      modelUsed,
    };
  }

  /**
   * Bulk classify — useful for an "Analyse all inbox" button. Sequential
   * for now (10-30 comments). Easy to parallelise later via Bull queue.
   */
  async classifyBatch(workspaceId: string, commentIds: string[]): Promise<{
    ok: boolean;
    classified: number;
    failed: number;
    results: ClassifyResult[];
  }> {
    if (!commentIds.length) throw new BadRequestException('No commentIds provided');
    if (commentIds.length > 50) throw new BadRequestException('Max 50 comments per batch');

    const results: ClassifyResult[] = [];
    let classified = 0;
    let failed = 0;
    for (const id of commentIds) {
      try {
        const r = await this.classify(workspaceId, id);
        results.push(r);
        if (r.ok) classified++;
        else failed++;
      } catch (err) {
        failed++;
        results.push({
          ok: false,
          commentId: id,
          intent: 'UNCLASSIFIED',
          sentiment: 'UNANALYZED',
          confidence: 0,
          urgency: 'low',
          reasoning: '',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    return { ok: classified > 0, classified, failed, results };
  }

  /**
   * Intent-aware reply suggestions. Reads the workspace's brand voice (if any)
   * and tailors the reply tone to BOTH the intent AND the brand voice. Returns
   * 3-4 suggestions each with tone + rationale so the user can pick.
   */
  async suggestReplies(workspaceId: string, commentId: string): Promise<ReplySuggestionResult> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, socialAccount: { workspaceId } },
      include: { socialAccount: { include: { workspace: { include: { brandVoices: { where: { isDefault: true }, take: 1 } } } } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const resolved = await this.credentials.resolveTextProvider(workspaceId);
    if (!resolved) {
      return {
        ok: false,
        intent: comment.intent,
        sentiment: comment.sentiment,
        urgency: this.deriveUrgency(comment.intent, comment.sentiment, comment.intentConfidence ?? 0),
        suggestions: [],
        message: 'Reply suggestions need a text AI provider. Add an Anthropic (Claude) or Google (Gemini) API key in Settings → AI Providers.',
      };
    }

    const brandVoice = comment.socialAccount.workspace.brandVoices[0] ?? null;
    const prompt = this.buildReplyPrompt(comment.body, comment.intent, comment.sentiment, brandVoice);

    let raw: string;
    let modelUsed: string;
    try {
      ({ raw, modelUsed } = await this.runAi(resolved, prompt, 1200, 0.7));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Reply suggest failed (${resolved.provider}): ${msg}`);
      return {
        ok: false,
        intent: comment.intent,
        sentiment: comment.sentiment,
        urgency: this.deriveUrgency(comment.intent, comment.sentiment, comment.intentConfidence ?? 0),
        suggestions: [],
        modelUsed: resolved.model,
        message: `${resolved.provider === 'claude' ? 'Claude' : 'Gemini'} request failed: ${msg}`,
      };
    }

    const parsed = this.parseReplies(raw);
    if (!parsed || parsed.suggestions.length === 0) {
      return {
        ok: false,
        intent: comment.intent,
        sentiment: comment.sentiment,
        urgency: this.deriveUrgency(comment.intent, comment.sentiment, comment.intentConfidence ?? 0),
        suggestions: [],
        modelUsed,
        message: 'AI returned no usable suggestions. Try again or switch provider.',
      };
    }

    return {
      ok: true,
      intent: comment.intent,
      sentiment: comment.sentiment,
      urgency: this.deriveUrgency(comment.intent, comment.sentiment, comment.intentConfidence ?? 0),
      suggestions: parsed.suggestions.slice(0, 4).map((s) => ({
        text: s.text.slice(0, 500),
        tone: s.tone.slice(0, 30),
        rationale: s.rationale.slice(0, 300),
      })),
      modelUsed,
    };
  }

  // ----------------------------------------------------------------

  private deriveUrgency(intent: CommentIntent, sentiment: CommentSentiment, confidence: number): Urgency {
    if (intent === 'COMPLAINT' && (sentiment === 'NEGATIVE' || sentiment === 'MIXED')) return 'high';
    if (intent === 'PURCHASE_INTENT') return 'high';
    if (intent === 'QUESTION') return 'medium';
    if (intent === 'FAN_ENGAGEMENT' && confidence < 0.6) return 'medium';
    return 'low';
  }

  private failResult(
    commentId: string, intent: CommentIntent, sentiment: CommentSentiment,
    confidence: number, message: string, modelUsed?: string,
  ): ClassifyResult {
    return {
      ok: false,
      commentId,
      intent,
      sentiment,
      confidence,
      urgency: this.deriveUrgency(intent, sentiment, confidence),
      reasoning: '',
      modelUsed,
      message,
    };
  }

  private async runAi(
    resolved: { provider: 'claude' | 'gemini'; apiKey: string; model: string },
    prompt: string,
    maxTokens: number,
    temperature: number,
  ): Promise<{ raw: string; modelUsed: string }> {
    if (resolved.provider === 'claude') {
      const client = new Anthropic({ apiKey: resolved.apiKey });
      const res = await client.messages.create({
        model: resolved.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = res.content.find((c) => c.type === 'text');
      return { raw: block?.type === 'text' ? block.text : '', modelUsed: res.model };
    }
    const client = new GoogleGenerativeAI(resolved.apiKey);
    const model = client.getGenerativeModel({
      model: resolved.model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature,
        maxOutputTokens: maxTokens,
      },
    });
    const res = await model.generateContent(prompt);
    return { raw: res.response.text(), modelUsed: resolved.model };
  }

  private buildClassifyPrompt(body: string, language?: string): string {
    return `You are a social media inbox classifier. Analyse this single comment and return strict JSON.

COMMENT${language ? ` (language: ${language})` : ''}:
"""
${body}
"""

CLASSIFY into:
- intent: one of "PURCHASE_INTENT", "COMPLAINT", "QUESTION", "FAN_ENGAGEMENT", "SPAM", "UNCLASSIFIED"
  - PURCHASE_INTENT: clear buying signal ("how much?", "do you ship to X?", "DM me to order", "in stock?")
  - COMPLAINT: negative experience needing resolution ("never received", "broken", "refund", "scam")
  - QUESTION: genuine information request that isn't about buying
  - FAN_ENGAGEMENT: positive/neutral engagement (compliment, emoji, "love this", reply to a story)
  - SPAM: generic promo, repetitive emoji, follow-for-follow, off-topic links
  - UNCLASSIFIED: truly ambiguous AND short

- sentiment: one of "POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED", "UNANALYZED"

- confidence: 0.0-1.0 — how sure are you of the intent?

- reasoning: ONE sentence (≤25 words) explaining the classification

Return STRICT JSON only — no markdown fences, no prose around it:
{
  "intent": "PURCHASE_INTENT" | "COMPLAINT" | "QUESTION" | "FAN_ENGAGEMENT" | "SPAM" | "UNCLASSIFIED",
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED" | "UNANALYZED",
  "confidence": 0.85,
  "reasoning": "..."
}`;
  }

  private buildReplyPrompt(
    body: string,
    intent: CommentIntent,
    sentiment: CommentSentiment,
    brandVoice: {
      toneTags: string[];
      perspective: string | null;
      emojiUsage: string | null;
      styleNotes: string | null;
      bannedWords: string[];
    } | null,
  ): string {
    const tones = brandVoice?.toneTags?.length ? brandVoice.toneTags.join(', ') : 'authentic, friendly';
    const perspective = brandVoice?.perspective ?? 'we';
    const emoji = brandVoice?.emojiUsage ?? 'minimal';
    const banned = brandVoice?.bannedWords?.length ? brandVoice.bannedWords.join(', ') : 'none';
    const notes = brandVoice?.styleNotes ?? '';

    const intentGuidance = this.intentReplyGuidance(intent);

    return `You are a social media community manager replying to ONE comment on behalf of a brand.

THE COMMENT:
"""
${body}
"""

CLASSIFIED AS:
- intent:    ${intent}
- sentiment: ${sentiment}

BRAND VOICE:
- Tone:        ${tones}
- Perspective: ${perspective}
- Emoji usage: ${emoji}
- Banned words: ${banned}
- Style notes: ${notes}

INTENT-SPECIFIC GUIDANCE:
${intentGuidance}

Generate 3-4 distinct reply OPTIONS. Each should:
- Be ≤200 characters (DM/comment-friendly length)
- Match the brand voice
- Vary in tone (warm vs direct vs playful) so the user can pick
- For PURCHASE_INTENT: include a clear next step (DM, link, "check pinned")
- For COMPLAINT: acknowledge → apologise (no excuses) → offer concrete resolution path
- For QUESTION: answer directly OR ask the ONE clarifying question that unblocks
- For FAN_ENGAGEMENT: thank + invite further engagement (question back, share, etc.)
- For SPAM: don't engage — return just one "ignore" suggestion + reason

Return STRICT JSON only:
{
  "suggestions": [
    {
      "text": "the actual reply text",
      "tone": "warm" | "direct" | "playful" | "professional" | "apologetic" | "curious",
      "rationale": "one sentence why this reply fits this comment + brand voice"
    }
  ]
}`;
  }

  private intentReplyGuidance(intent: CommentIntent): string {
    switch (intent) {
      case 'PURCHASE_INTENT':
        return 'High-value lead. Reply within minutes. Move to DM if possible. Don\'t over-pitch — answer the actual question, then give one clear next step.';
      case 'COMPLAINT':
        return 'Acknowledge the issue WITHOUT excuses. Move to DM for resolution. Don\'t blame the customer. Don\'t promise what you can\'t deliver.';
      case 'QUESTION':
        return 'Answer directly if possible. If you need more info, ask the ONE most-blocking clarifying question. Don\'t deflect to a help page if you can answer in 2 lines.';
      case 'FAN_ENGAGEMENT':
        return 'Thank genuinely. Invite further engagement — a question back, a story share, etc. Make them feel SEEN, not transacted with.';
      case 'SPAM':
        return 'Just one suggestion: "Ignore" or "Hide". Explain briefly why engaging would be counter-productive.';
      default:
        return 'Reply in a way that draws out the user\'s actual intent.';
    }
  }

  private parseClassify(raw: string): AiClassifyResponse | null {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      const validIntents: CommentIntent[] = [
        'PURCHASE_INTENT', 'COMPLAINT', 'QUESTION', 'FAN_ENGAGEMENT', 'SPAM', 'UNCLASSIFIED',
      ];
      const validSentiments: CommentSentiment[] = [
        'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNANALYZED',
      ];
      if (
        validIntents.includes(parsed?.intent) &&
        validSentiments.includes(parsed?.sentiment) &&
        typeof parsed?.confidence === 'number' &&
        typeof parsed?.reasoning === 'string'
      ) {
        return {
          intent: parsed.intent,
          sentiment: parsed.sentiment,
          confidence: Math.max(0, Math.min(1, parsed.confidence)),
          reasoning: parsed.reasoning,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseReplies(raw: string): AiReplyResponse | null {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (
        Array.isArray(parsed?.suggestions) &&
        parsed.suggestions.every(
          (s: { text?: unknown; tone?: unknown; rationale?: unknown }) =>
            typeof s?.text === 'string' &&
            typeof s?.tone === 'string' &&
            typeof s?.rationale === 'string',
        )
      ) {
        return parsed as AiReplyResponse;
      }
      return null;
    } catch {
      return null;
    }
  }
}
