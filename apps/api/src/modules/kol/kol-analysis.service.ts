import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { KolService } from './kol.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';

interface PostingTimePoint {
  hourUtc: number; // 0..23
  count: number;
}

interface CommentSample {
  text: string;
  language?: string;
}

/**
 * KOL Authenticity Analysis.
 *
 * Combines two signals into one composite authenticity score (0–100):
 *
 *   bot24x7Score (0..1): how uniform their posting is across all 24 hours.
 *     Real creators sleep — they post in bursts. Bots post evenly. Computed
 *     as the entropy of the hourly post distribution normalised to [0,1].
 *     Higher = more bot-like.
 *
 *   commentLanguageScore (0..1): how generic vs. content-specific the
 *     comments on their posts are. Real engagement references specifics
 *     ("the part about X resonated"). Bot comments are flat ("nice post",
 *     "🔥🔥🔥"). We ask Claude to grade a sample of comments.
 *     Higher = more bot-like.
 *
 * Composite authenticityScore (0..100, higher is better):
 *   100 - round(((bot24x7Score + commentLanguageScore) / 2) * 100)
 *
 * Research basis:
 *   - HypeAuditor's bot detection methodology (24/7 posting uniformity)
 *   - Forrester 2026 influencer fraud report (generic comment patterns)
 */
@Injectable()
export class KolAnalysisService {
  private readonly logger = new Logger(KolAnalysisService.name);

  constructor(
    private kolService: KolService,
    private credentials: AiCredentialsService,
  ) {}

  /** Score posting-hour uniformity. Returns 0..1, higher = more bot-like. */
  scoreBot24x7(distribution: PostingTimePoint[]): number {
    if (!distribution.length) return 0;
    const total = distribution.reduce((s, p) => s + p.count, 0);
    if (total === 0) return 0;

    // Compute Shannon entropy across 24 hourly buckets, normalised against
    // the uniform distribution's max entropy (log2(24)).
    const buckets = new Array(24).fill(0);
    for (const p of distribution) {
      if (p.hourUtc >= 0 && p.hourUtc < 24) buckets[p.hourUtc] = p.count;
    }
    let entropy = 0;
    for (const c of buckets) {
      if (c === 0) continue;
      const p = c / total;
      entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(24);
    return Math.min(1, Math.max(0, entropy / maxEntropy));
  }

  /**
   * Ask Claude (using the workspace's BYOK key) to rate the genericness of
   * a sample of comments. Returns 0..1, higher = more bot-like (more generic).
   *
   * Falls back to a deterministic length-based heuristic when no Anthropic
   * key is configured.
   */
  async scoreCommentLanguage(
    workspaceId: string,
    comments: CommentSample[],
  ): Promise<number> {
    if (!comments.length) return 0;

    const apiKey = await this.credentials.getDecryptedKey(workspaceId, 'anthropicKey');

    if (!apiKey) {
      // Deterministic fallback: very short / emoji-only comments are
      // suspicious. Counts comments with <12 alphanumeric chars as generic.
      const genericCount = comments.filter((c) => {
        const alnum = c.text.replace(/[^A-Za-z0-9一-鿿]/g, '');
        return alnum.length < 12;
      }).length;
      return Math.min(1, genericCount / comments.length);
    }

    const client = new Anthropic({ apiKey });
    const model = await this.credentials.getModel(workspaceId, 'anthropic');

    const sample = comments
      .slice(0, 50) // cap to keep prompt small
      .map((c, i) => `[${i + 1}] (${c.language ?? '?'}) ${c.text}`)
      .join('\n');

    const prompt = `Analyse this sample of comments on a single creator's posts. For each comment, judge whether it is:
- SPECIFIC: references concrete content from the post (a phrase, a fact, a moment, a question about something said)
- GENERIC: bland praise/emoji-only ("nice", "🔥🔥🔥", "love this", "great post", "👍")

Return strict JSON:
{
  "totalAnalysed": <int>,
  "genericCount": <int>,
  "explanation": "<one sentence on the dominant pattern>"
}

COMMENTS:
${sample}`;

    try {
      const res = await client.messages.create({
        model,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = res.content.find((c) => c.type === 'text');
      const raw = block?.type === 'text' ? block.text : '';
      const json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());
      const total = Number(json.totalAnalysed) || comments.length;
      const generic = Math.max(0, Math.min(total, Number(json.genericCount) || 0));
      return generic / total;
    } catch (err) {
      this.logger.warn(`Claude comment scoring failed: ${(err as Error).message}`);
      return 0.5; // unknown
    }
  }

  /**
   * Full analysis: compute both signals, persist them on the KOL, return
   * the composite authenticity score.
   *
   * For a real production flow this would also pull live posting-time
   * distribution + comment sample from the platform's API. Here the caller
   * provides them — useful for testing and for when we already have them
   * cached from a previous fetch.
   */
  async analyze(
    workspaceId: string,
    kolId: string,
    input: {
      postingTimeDistributionUtc?: PostingTimePoint[];
      commentSample?: CommentSample[];
    },
  ) {
    if (!input.postingTimeDistributionUtc?.length && !input.commentSample?.length) {
      throw new BadRequestException(
        'analyze() needs at least one of postingTimeDistributionUtc or commentSample',
      );
    }

    const bot24x7Score = input.postingTimeDistributionUtc
      ? this.scoreBot24x7(input.postingTimeDistributionUtc)
      : undefined;

    const commentLanguageScore = input.commentSample
      ? await this.scoreCommentLanguage(workspaceId, input.commentSample)
      : undefined;

    // Composite — average the bot-likelihood signals, invert to authenticity.
    const componentBotScores: number[] = [];
    if (bot24x7Score !== undefined) componentBotScores.push(bot24x7Score);
    if (commentLanguageScore !== undefined) componentBotScores.push(commentLanguageScore);
    const avgBot = componentBotScores.reduce((s, v) => s + v, 0) / componentBotScores.length;
    const authenticityScore = Math.round((1 - avgBot) * 100);

    const updated = await this.kolService.updateScores(kolId, {
      bot24x7Score,
      commentLanguageScore,
      authenticityScore,
    });

    return {
      kol: updated,
      breakdown: {
        bot24x7Score,
        commentLanguageScore,
        authenticityScore,
        interpretation:
          authenticityScore >= 75
            ? 'High authenticity — engagement looks real'
            : authenticityScore >= 50
              ? 'Mixed — some red flags worth investigating'
              : 'Low authenticity — likely heavy bot engagement',
      },
    };
  }
}
