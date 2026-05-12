/**
 * Platform-specific constraints, format rules, and algorithm intelligence.
 * Single source of truth used by both web and api.
 */

export type SocialPlatform =
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'REDNOTE'
  | 'FACEBOOK'
  | 'LINKEDIN'
  | 'YOUTUBE'
  | 'X'
  | 'THREADS'
  | 'LEMON8'
  | 'PINTEREST';

export interface PlatformSpec {
  id: SocialPlatform;
  displayName: string;
  // Caption
  maxCaptionLength: number;
  optimalCaptionLength: { min: number; max: number };
  // Hashtags
  maxHashtags: number;
  optimalHashtags: number;
  // Media
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsCarousel: boolean;
  maxCarouselItems: number;
  // Image
  imageAspectRatios: string[]; // e.g., ["1:1", "4:5", "9:16"]
  preferredImageAspect: string;
  maxImageSizeMb: number;
  // Video
  videoAspectRatios: string[];
  preferredVideoAspect: string;
  maxVideoSizeMb: number;
  maxVideoDurationSec: number;
  minVideoDurationSec: number;
  // Language
  supportedLanguages: string[];
  primaryLanguage: string;
  // Algorithm signals (research-backed)
  topRankingSignals: string[];
}

export const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
  INSTAGRAM: {
    id: 'INSTAGRAM',
    displayName: 'Instagram',
    maxCaptionLength: 2200,
    optimalCaptionLength: { min: 138, max: 150 },
    maxHashtags: 30,
    optimalHashtags: 9,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 10,
    imageAspectRatios: ['1:1', '4:5', '1.91:1'],
    preferredImageAspect: '4:5',
    maxImageSizeMb: 30,
    videoAspectRatios: ['9:16', '1:1', '4:5'],
    preferredVideoAspect: '9:16',
    maxVideoSizeMb: 4096,
    maxVideoDurationSec: 90,
    minVideoDurationSec: 3,
    supportedLanguages: ['en', 'es', 'pt', 'fr', 'de', 'ja', 'ko', 'zh-CN', 'zh-TW'],
    primaryLanguage: 'en',
    topRankingSignals: ['watch_time', 'dm_shares', 'saves', 'completion_rate', 'trending_audio'],
  },
  TIKTOK: {
    id: 'TIKTOK',
    displayName: 'TikTok',
    maxCaptionLength: 2200,
    optimalCaptionLength: { min: 80, max: 120 },
    maxHashtags: 30,
    optimalHashtags: 5,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 35,
    imageAspectRatios: ['9:16', '1:1'],
    preferredImageAspect: '9:16',
    maxImageSizeMb: 20,
    videoAspectRatios: ['9:16'],
    preferredVideoAspect: '9:16',
    maxVideoSizeMb: 287,
    maxVideoDurationSec: 600,
    minVideoDurationSec: 3,
    supportedLanguages: ['en', 'zh-CN', 'es', 'pt', 'fr', 'de', 'ja', 'ko', 'ar'],
    primaryLanguage: 'en',
    topRankingSignals: [
      'watch_time',
      'replays',
      'shares',
      'trending_sounds',
      'first_3_sec_hook',
      'completion_rate',
    ],
  },
  REDNOTE: {
    id: 'REDNOTE',
    displayName: '小红书 RedNote',
    maxCaptionLength: 1000,
    optimalCaptionLength: { min: 200, max: 600 },
    maxHashtags: 10,
    optimalHashtags: 5,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 18,
    imageAspectRatios: ['3:4', '1:1'],
    preferredImageAspect: '3:4',
    maxImageSizeMb: 32,
    videoAspectRatios: ['9:16', '3:4', '1:1'],
    preferredVideoAspect: '9:16',
    maxVideoSizeMb: 500,
    maxVideoDurationSec: 600,
    minVideoDurationSec: 3,
    supportedLanguages: ['zh-CN', 'zh-TW', 'en'],
    primaryLanguage: 'zh-CN',
    // RedNote uses CES scoring: Comments=4, Shares=4, Follows=8, Likes=1, Collections=1
    topRankingSignals: [
      'ces_score',
      'follows_from_post',
      'collections',
      'comments',
      'shares',
      'cover_image_quality',
      'keyword_in_title',
      'search_intent_match',
    ],
  },
  FACEBOOK: {
    id: 'FACEBOOK',
    displayName: 'Facebook',
    maxCaptionLength: 63206,
    optimalCaptionLength: { min: 40, max: 80 },
    maxHashtags: 30,
    optimalHashtags: 2,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 10,
    imageAspectRatios: ['1.91:1', '1:1', '4:5'],
    preferredImageAspect: '1.91:1',
    maxImageSizeMb: 30,
    videoAspectRatios: ['16:9', '1:1', '9:16', '4:5'],
    preferredVideoAspect: '16:9',
    maxVideoSizeMb: 10240,
    maxVideoDurationSec: 14400,
    minVideoDurationSec: 1,
    supportedLanguages: ['en', 'es', 'pt', 'fr', 'de', 'ja', 'ko', 'zh-CN', 'ar'],
    primaryLanguage: 'en',
    topRankingSignals: ['meaningful_interactions', 'comments', 'shares', 'reactions'],
  },
  LINKEDIN: {
    id: 'LINKEDIN',
    displayName: 'LinkedIn',
    maxCaptionLength: 3000,
    optimalCaptionLength: { min: 1300, max: 2000 },
    maxHashtags: 5,
    optimalHashtags: 3,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 20,
    imageAspectRatios: ['1.91:1', '1:1'],
    preferredImageAspect: '1.91:1',
    maxImageSizeMb: 5,
    videoAspectRatios: ['16:9', '1:1', '9:16'],
    preferredVideoAspect: '16:9',
    maxVideoSizeMb: 5120,
    maxVideoDurationSec: 600,
    minVideoDurationSec: 3,
    supportedLanguages: ['en', 'es', 'pt', 'fr', 'de', 'ja', 'ko', 'zh-CN'],
    primaryLanguage: 'en',
    topRankingSignals: ['dwell_time', 'comments', 'shares', 'long_form_text'],
  },
  YOUTUBE: {
    id: 'YOUTUBE',
    displayName: 'YouTube',
    maxCaptionLength: 5000,
    optimalCaptionLength: { min: 250, max: 1000 },
    maxHashtags: 15,
    optimalHashtags: 5,
    supportsImage: false,
    supportsVideo: true,
    supportsCarousel: false,
    maxCarouselItems: 0,
    imageAspectRatios: ['16:9'],
    preferredImageAspect: '16:9',
    maxImageSizeMb: 2,
    videoAspectRatios: ['16:9', '9:16'],
    preferredVideoAspect: '16:9',
    maxVideoSizeMb: 256000,
    maxVideoDurationSec: 43200,
    minVideoDurationSec: 1,
    supportedLanguages: ['en', 'es', 'pt', 'fr', 'de', 'ja', 'ko', 'zh-CN', 'ar', 'hi'],
    primaryLanguage: 'en',
    topRankingSignals: ['watch_time', 'click_through_rate', 'session_duration', 'subscriber_signal'],
  },
  X: {
    id: 'X',
    displayName: 'X (Twitter)',
    maxCaptionLength: 280,
    optimalCaptionLength: { min: 70, max: 100 },
    maxHashtags: 10,
    optimalHashtags: 2,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 4,
    imageAspectRatios: ['16:9', '1:1'],
    preferredImageAspect: '16:9',
    maxImageSizeMb: 5,
    videoAspectRatios: ['16:9', '1:1'],
    preferredVideoAspect: '16:9',
    maxVideoSizeMb: 512,
    maxVideoDurationSec: 140,
    minVideoDurationSec: 1,
    supportedLanguages: ['en', 'ja', 'es', 'pt', 'ko', 'zh-CN'],
    primaryLanguage: 'en',
    topRankingSignals: ['engagement_velocity', 'replies', 'retweets', 'profile_clicks'],
  },
  THREADS: {
    id: 'THREADS',
    displayName: 'Threads',
    maxCaptionLength: 500,
    optimalCaptionLength: { min: 100, max: 280 },
    maxHashtags: 1,
    optimalHashtags: 1,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 10,
    imageAspectRatios: ['1:1', '4:5'],
    preferredImageAspect: '1:1',
    maxImageSizeMb: 30,
    videoAspectRatios: ['9:16', '1:1'],
    preferredVideoAspect: '9:16',
    maxVideoSizeMb: 4096,
    maxVideoDurationSec: 300,
    minVideoDurationSec: 3,
    supportedLanguages: ['en', 'ja', 'es', 'pt', 'ko'],
    primaryLanguage: 'en',
    topRankingSignals: ['replies', 'reposts', 'engagement_velocity'],
  },
  LEMON8: {
    id: 'LEMON8',
    displayName: 'Lemon8',
    maxCaptionLength: 1000,
    optimalCaptionLength: { min: 200, max: 500 },
    maxHashtags: 10,
    optimalHashtags: 5,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 9,
    imageAspectRatios: ['3:4', '1:1'],
    preferredImageAspect: '3:4',
    maxImageSizeMb: 30,
    videoAspectRatios: ['9:16', '3:4'],
    preferredVideoAspect: '9:16',
    maxVideoSizeMb: 500,
    maxVideoDurationSec: 60,
    minVideoDurationSec: 3,
    supportedLanguages: ['en', 'ja', 'th', 'id', 'zh-TW'],
    primaryLanguage: 'en',
    topRankingSignals: ['saves', 'shares', 'aesthetic_quality'],
  },
  PINTEREST: {
    id: 'PINTEREST',
    displayName: 'Pinterest',
    maxCaptionLength: 500,
    optimalCaptionLength: { min: 100, max: 200 },
    maxHashtags: 20,
    optimalHashtags: 8,
    supportsImage: true,
    supportsVideo: true,
    supportsCarousel: true,
    maxCarouselItems: 5,
    imageAspectRatios: ['2:3', '1:1'],
    preferredImageAspect: '2:3',
    maxImageSizeMb: 32,
    videoAspectRatios: ['9:16', '1:1', '2:3'],
    preferredVideoAspect: '9:16',
    maxVideoSizeMb: 2048,
    maxVideoDurationSec: 60,
    minVideoDurationSec: 4,
    supportedLanguages: ['en', 'es', 'pt', 'fr', 'de', 'ja'],
    primaryLanguage: 'en',
    topRankingSignals: ['saves', 'click_through_rate', 'pin_quality_score'],
  },
};

export function getPlatformSpec(platform: SocialPlatform): PlatformSpec {
  return PLATFORM_SPECS[platform];
}
