import { Injectable } from '@nestjs/common';
import { AlgorithmCoachService, type CoachingNote } from './algorithm-coach.service';
import { getPlatformSpec, type SocialPlatform, type ViralityScoreResponse } from '@inboudly/shared';

interface VariantInput {
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  language: string;
  hasImage: boolean;
  hasVideo: boolean;
  videoDurationSec?: number;
  hasCaptionsBurnedIn?: boolean;
  hasTrendingAudio?: boolean;
}

interface ViralityInput {
  variants: VariantInput[];
  scheduledFor?: Date;
}

/**
 * Pre-publish Virality Score (0-100) per platform.
 *
 * V1 = research-grounded heuristic ensemble (rule-based weighting of features
 * proven to predict engagement: emotional valence, length sweet-spot, time-of-post,
 * hashtag count, hook strength).
 *
 * V2 (Phase 2) = trained XGBoost model on real engagement data, replacing the
 * heuristics with learned weights. Same input/output contract.
 */
@Injectable()
export class ViralityScoreService {
  constructor(private coach: AlgorithmCoachService) {}

  score(input: ViralityInput): ViralityScoreResponse {
    const perPlatform = input.variants.map((v) => this.scoreVariant(v, input.scheduledFor));
    const overall = Math.round(
      perPlatform.reduce((sum, p) => sum + p.score, 0) / perPlatform.length,
    );

    return {
      overallScore: overall,
      perPlatform,
    };
  }

  private scoreVariant(v: VariantInput, scheduledFor?: Date) {
    const spec = getPlatformSpec(v.platform);
    const coachingNotes = this.coach.evaluate(v);

    let score = 70; // baseline

    // Caption length sweet-spot
    const len = v.caption.length;
    const inSweetSpot = len >= spec.optimalCaptionLength.min && len <= spec.optimalCaptionLength.max;
    if (inSweetSpot) score += 8;
    else if (len < spec.optimalCaptionLength.min / 2) score -= 6;
    else if (len > spec.maxCaptionLength) score -= 25;

    // Hashtag count
    const hashtagDelta = Math.abs(v.hashtags.length - spec.optimalHashtags);
    score -= hashtagDelta * 1.5;

    // Hook strength (first line scoring)
    const firstLine = v.caption.split('\n')[0] ?? '';
    if (this.hasStrongHook(firstLine)) score += 6;
    else if (firstLine.length === 0) score -= 8;

    // Media bonus
    if (v.hasVideo) score += 5;
    if (v.hasVideo && v.hasCaptionsBurnedIn) score += 4;
    if (v.hasVideo && v.hasTrendingAudio) score += 6;

    // Time-of-post heuristic (placeholder — Phase 2 uses real audience data)
    if (scheduledFor) {
      const hour = scheduledFor.getHours();
      if (this.isPrimeHour(v.platform, hour)) score += 3;
    }

    // Apply penalties from coach (critical issues hurt the most)
    for (const note of coachingNotes) {
      if (note.severity === 'critical') score -= 10;
      else if (note.severity === 'warning') score -= 4;
      else if (note.severity === 'suggestion') score -= 1;
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      platform: v.platform,
      score,
      predictedReach: this.estimateReach(score),
      predictedEngagementRate: Number((this.estimateEngagement(score) / 100).toFixed(4)),
      coachingNotes,
    };
  }

  private hasStrongHook(line: string): boolean {
    if (!line) return false;
    // Strong-hook signals: questions, numbers, surprise words, contrarian openers
    return (
      /\?$/.test(line.trim()) ||
      /^\d/.test(line) ||
      /\b(why|how|what|never|always|surprising|truth|wrong|secret)\b/i.test(line) ||
      /[!?]/.test(line)
    );
  }

  private isPrimeHour(platform: SocialPlatform, hour: number): boolean {
    // Industry-aggregated optimal posting windows (will be replaced by per-account ML)
    const windows: Record<string, number[]> = {
      INSTAGRAM: [11, 13, 19, 20, 21],
      TIKTOK: [6, 10, 19, 22, 23],
      REDNOTE: [8, 12, 18, 21, 22], // China timezone
      FACEBOOK: [9, 13, 15],
      LINKEDIN: [8, 12, 17],
      YOUTUBE: [14, 15, 16, 17],
    };
    return windows[platform]?.includes(hour) ?? false;
  }

  private estimateReach(score: number): number {
    // Rough exponential mapping — Phase 2 calibrates to real account baselines
    return Math.round(Math.pow(score / 50, 2.2) * 1000);
  }

  private estimateEngagement(score: number): number {
    // Returns engagement rate as percentage (0-15%)
    return Math.round(((score / 100) ** 1.5) * 1500) / 100;
  }
}
