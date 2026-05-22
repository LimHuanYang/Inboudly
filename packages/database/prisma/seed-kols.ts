/**
 * Seed ~24 synthetic KOLs across RedNote, Instagram, and TikTok so the
 * Discovery UI has data to render before any live platform-scrape is wired.
 *
 * Run with: pnpm --filter @inboudly/database tsx prisma/seed-kols.ts
 */
import { PrismaClient, SocialPlatform } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedKol {
  platform: SocialPlatform;
  handle: string;
  displayName: string;
  bio: string;
  niche: string[];
  language: string;
  country: string;
  followerCount: number;
  engagementRate: number; // 0..1
  authenticityScore: number; // 0..100
  bot24x7Score: number;     // 0..1 — higher = more bot-like
  commentLanguageScore: number;
  avatarUrl?: string;
}

const KOLS: SeedKol[] = [
  // --- RedNote (Xiaohongshu) — skincare / beauty / lifestyle ---
  {
    platform: 'REDNOTE',
    handle: '@SeleneSkincare',
    displayName: '林晨曦 · Skincare Diary',
    bio: '敏感肌护肤分享 · 真实测评 · 北京 | Sharing sensitive-skin skincare honestly.',
    niche: ['skincare', 'beauty', 'sensitive-skin'],
    language: 'zh-CN',
    country: 'CN',
    followerCount: 184_000,
    engagementRate: 0.082,
    authenticityScore: 91,
    bot24x7Score: 0.12,
    commentLanguageScore: 0.08,
  },
  {
    platform: 'REDNOTE',
    handle: '@TokyoLatteGirl',
    displayName: '咖啡日记 Mio',
    bio: '东京咖啡探店 · 慢生活 · 一周三杯',
    niche: ['cafe', 'coffee', 'lifestyle', 'tokyo'],
    language: 'zh-CN',
    country: 'JP',
    followerCount: 62_500,
    engagementRate: 0.115,
    authenticityScore: 88,
    bot24x7Score: 0.18,
    commentLanguageScore: 0.13,
  },
  {
    platform: 'REDNOTE',
    handle: '@MeatPrep_Master',
    displayName: 'Golden Meat Lab',
    bio: '肉类批发 · 高端餐厅供应 · 商家可联系',
    niche: ['food', 'meat', 'wholesale', 'restaurant'],
    language: 'zh-CN',
    country: 'CN',
    followerCount: 23_400,
    engagementRate: 0.043,
    authenticityScore: 76,
    bot24x7Score: 0.29,
    commentLanguageScore: 0.21,
  },
  {
    platform: 'REDNOTE',
    handle: '@FitJourneyAva',
    displayName: '艾娃 Ava · 健身',
    bio: '居家健身 · 减脂日记 · 已减35斤',
    niche: ['fitness', 'weight-loss', 'home-workout'],
    language: 'zh-CN',
    country: 'CN',
    followerCount: 412_000,
    engagementRate: 0.061,
    authenticityScore: 83,
    bot24x7Score: 0.22,
    commentLanguageScore: 0.14,
  },
  {
    platform: 'REDNOTE',
    handle: '@QuickEats_Hk',
    displayName: '香港3分钟早餐',
    bio: '上班族3分钟早餐合集 · 一周七天不重样',
    niche: ['food', 'breakfast', 'quick-recipes'],
    language: 'zh-CN',
    country: 'HK',
    followerCount: 91_200,
    engagementRate: 0.095,
    authenticityScore: 87,
    bot24x7Score: 0.15,
    commentLanguageScore: 0.12,
  },
  {
    platform: 'REDNOTE',
    handle: '@LuxuryReseller_Bot',
    displayName: '名包代购',
    bio: '欧洲直邮 · 包邮包税 · DM询价',
    niche: ['luxury', 'fashion', 'reseller'],
    language: 'zh-CN',
    country: 'IT',
    followerCount: 8_900,
    engagementRate: 0.012,
    authenticityScore: 28,
    bot24x7Score: 0.81,
    commentLanguageScore: 0.74,
  },

  // --- Instagram — varied ---
  {
    platform: 'INSTAGRAM',
    handle: '@minimalistmornings',
    displayName: 'Hana K.',
    bio: 'Slow mornings, soft light, single-origin coffee. Brooklyn.',
    niche: ['lifestyle', 'coffee', 'photography', 'minimal'],
    language: 'en',
    country: 'US',
    followerCount: 247_300,
    engagementRate: 0.054,
    authenticityScore: 86,
    bot24x7Score: 0.18,
    commentLanguageScore: 0.10,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@aurelia.skin',
    displayName: 'Aurelia · Clean Beauty',
    bio: 'Esthetician · clean ingredients · skin barrier obsessed.',
    niche: ['skincare', 'clean-beauty', 'esthetician'],
    language: 'en',
    country: 'AU',
    followerCount: 138_700,
    engagementRate: 0.073,
    authenticityScore: 89,
    bot24x7Score: 0.13,
    commentLanguageScore: 0.09,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@nomadkitchen',
    displayName: 'Nomad Kitchen',
    bio: '90-second recipes from 47 countries. Eat the world.',
    niche: ['food', 'recipes', 'travel'],
    language: 'en',
    country: 'GB',
    followerCount: 612_500,
    engagementRate: 0.048,
    authenticityScore: 80,
    bot24x7Score: 0.25,
    commentLanguageScore: 0.17,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@cheapfollowerz',
    displayName: 'Best Growth Hub',
    bio: 'DM for collab 🚀 100k followers in 30 days guaranteed',
    niche: ['marketing', 'growth-hacks'],
    language: 'en',
    country: 'US',
    followerCount: 220_000,
    engagementRate: 0.003,
    authenticityScore: 19,
    bot24x7Score: 0.92,
    commentLanguageScore: 0.85,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@earnest_eats',
    displayName: 'Earnest Eats',
    bio: 'Honest restaurant reviews · Toronto · sponsored posts marked',
    niche: ['food', 'restaurants', 'reviews'],
    language: 'en',
    country: 'CA',
    followerCount: 49_800,
    engagementRate: 0.092,
    authenticityScore: 92,
    bot24x7Score: 0.10,
    commentLanguageScore: 0.07,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@fitwithrei',
    displayName: 'Rei · Strength Coach',
    bio: 'Powerlifting + mobility · NSCA-CSCS · Singapore',
    niche: ['fitness', 'strength', 'powerlifting'],
    language: 'en',
    country: 'SG',
    followerCount: 87_100,
    engagementRate: 0.067,
    authenticityScore: 84,
    bot24x7Score: 0.20,
    commentLanguageScore: 0.13,
  },

  // --- TikTok ---
  {
    platform: 'TIKTOK',
    handle: '@brewlab',
    displayName: 'BrewLab',
    bio: 'Coffee science in 30s. Espresso parameters explained.',
    niche: ['coffee', 'science', 'how-to'],
    language: 'en',
    country: 'US',
    followerCount: 945_000,
    engagementRate: 0.071,
    authenticityScore: 88,
    bot24x7Score: 0.16,
    commentLanguageScore: 0.11,
  },
  {
    platform: 'TIKTOK',
    handle: '@meatcarver.daily',
    displayName: 'Meat Carver Daily',
    bio: 'Knife skills · primal cuts · butcher humor',
    niche: ['food', 'butchery', 'cooking'],
    language: 'en',
    country: 'AU',
    followerCount: 386_400,
    engagementRate: 0.082,
    authenticityScore: 85,
    bot24x7Score: 0.19,
    commentLanguageScore: 0.13,
  },
  {
    platform: 'TIKTOK',
    handle: '@skincarechemistDR',
    displayName: 'Dr. Amelia · Skincare Chem',
    bio: 'PhD chemist debunking skincare myths · viral 8x',
    niche: ['skincare', 'science', 'debunking'],
    language: 'en',
    country: 'US',
    followerCount: 1_240_000,
    engagementRate: 0.094,
    authenticityScore: 93,
    bot24x7Score: 0.09,
    commentLanguageScore: 0.06,
  },
  {
    platform: 'TIKTOK',
    handle: '@nightowl_growth',
    displayName: 'Growth Hacker Pro',
    bio: 'Buy followers cheap · DM bot service · 24/7 online',
    niche: ['marketing', 'growth-hacks'],
    language: 'en',
    country: 'PH',
    followerCount: 110_300,
    engagementRate: 0.004,
    authenticityScore: 15,
    bot24x7Score: 0.94,
    commentLanguageScore: 0.88,
  },
  {
    platform: 'TIKTOK',
    handle: '@bakerybyleah',
    displayName: 'Leah · Home Baker',
    bio: 'Sourdough · viennoiserie · kitchen mess included',
    niche: ['baking', 'food', 'sourdough'],
    language: 'en',
    country: 'NZ',
    followerCount: 73_200,
    engagementRate: 0.118,
    authenticityScore: 90,
    bot24x7Score: 0.11,
    commentLanguageScore: 0.08,
  },
  {
    platform: 'TIKTOK',
    handle: '@dadgear_reviews',
    displayName: 'Dad Gear Reviews',
    bio: 'Tools, gadgets, dad jokes. 12-year woodworker.',
    niche: ['tools', 'reviews', 'diy'],
    language: 'en',
    country: 'US',
    followerCount: 41_700,
    engagementRate: 0.065,
    authenticityScore: 82,
    bot24x7Score: 0.21,
    commentLanguageScore: 0.16,
  },

  // --- More diversity ---
  {
    platform: 'REDNOTE',
    handle: '@WeddingMakeup_Sh',
    displayName: 'Shanghai 婚礼妆 · Iris',
    bio: '上海婚礼妆 · 韩式自然 · 接档期至2026Q4',
    niche: ['makeup', 'wedding', 'beauty'],
    language: 'zh-CN',
    country: 'CN',
    followerCount: 156_000,
    engagementRate: 0.054,
    authenticityScore: 81,
    bot24x7Score: 0.24,
    commentLanguageScore: 0.18,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@petalandvine',
    displayName: 'Petal & Vine · Florist',
    bio: 'Seasonal florals · wedding installs · Lisbon',
    niche: ['florals', 'wedding', 'seasonal'],
    language: 'en',
    country: 'PT',
    followerCount: 67_800,
    engagementRate: 0.089,
    authenticityScore: 87,
    bot24x7Score: 0.14,
    commentLanguageScore: 0.11,
  },
  {
    platform: 'TIKTOK',
    handle: '@rusticfurnacejp',
    displayName: 'Rustic Furnace JP',
    bio: 'Japanese forge · katana / knife / mukimono knives',
    niche: ['crafts', 'knives', 'forging', 'japan'],
    language: 'ja',
    country: 'JP',
    followerCount: 528_000,
    engagementRate: 0.124,
    authenticityScore: 94,
    bot24x7Score: 0.08,
    commentLanguageScore: 0.05,
  },
  {
    platform: 'REDNOTE',
    handle: '@PetCareVet',
    displayName: '宠物医生 Dr. Wang',
    bio: '执业兽医12年 · 宠物用药科普 · 北京三里屯',
    niche: ['pets', 'veterinary', 'education'],
    language: 'zh-CN',
    country: 'CN',
    followerCount: 78_900,
    engagementRate: 0.103,
    authenticityScore: 90,
    bot24x7Score: 0.12,
    commentLanguageScore: 0.09,
  },
  {
    platform: 'INSTAGRAM',
    handle: '@vintage.electronics',
    displayName: 'Vintage Electronics',
    bio: 'Restoring 70s/80s hi-fi. Walnut and brass.',
    niche: ['electronics', 'restoration', 'vintage'],
    language: 'en',
    country: 'DE',
    followerCount: 34_200,
    engagementRate: 0.072,
    authenticityScore: 86,
    bot24x7Score: 0.16,
    commentLanguageScore: 0.12,
  },
];

async function main() {
  console.log(`🌱 Seeding ${KOLS.length} synthetic KOLs…`);
  let created = 0;
  let updated = 0;

  for (const seed of KOLS) {
    const platformUserId = seed.handle.replace(/^@/, '').toLowerCase();
    const existing = await prisma.kol.findUnique({
      where: { platform_platformUserId: { platform: seed.platform, platformUserId } },
    });

    const data = {
      platform: seed.platform,
      platformUserId,
      handle: seed.handle,
      displayName: seed.displayName,
      bio: seed.bio,
      niche: seed.niche,
      language: seed.language,
      country: seed.country,
      followerCount: seed.followerCount,
      engagementRate: seed.engagementRate,
      authenticityScore: seed.authenticityScore,
      bot24x7Score: seed.bot24x7Score,
      commentLanguageScore: seed.commentLanguageScore,
      lastAnalyzedAt: new Date(),
      avatarUrl: seed.avatarUrl ?? null,
    };

    if (existing) {
      await prisma.kol.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.kol.create({ data });
      created++;
    }
  }

  console.log(`✅ Done. Created ${created}, updated ${updated}.`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
