import { PrismaClient, type SocialPlatform } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds sample competitors for the demo workspace + backfills 30 days of
 * mock snapshots so the timeline UI has data on first paint.
 *
 * Idempotent: re-running won't duplicate competitors (upserts on
 * workspaceId + platform + handle).
 */
async function main() {
  // Find the demo workspace seeded in prisma/seed.ts
  const ws = await prisma.workspace.findFirst({ where: { slug: 'main' } });
  if (!ws) {
    console.error('No demo workspace found. Run `pnpm db:seed` first.');
    process.exit(1);
  }
  console.log(`Seeding competitors into workspace "${ws.name}" (${ws.id})...`);

  // Real-ish brand competitors a typical user might track. Across the three
  // Phase 1 platforms so the demo shows a mix.
  const samples: Array<{
    platform: SocialPlatform;
    handle: string;
    displayName: string;
    notes?: string;
  }> = [
    // RedNote — brand-direct accounts that dominate Chinese consumer purchase decisions
    { platform: 'REDNOTE', handle: 'perfectdiary',     displayName: '完美日记 Perfect Diary',  notes: 'Top affordable beauty brand on RN' },
    { platform: 'REDNOTE', handle: 'florasis_official', displayName: '花西子 Florasis',         notes: 'Traditional Chinese cosmetics' },
    { platform: 'REDNOTE', handle: 'heytea_official',   displayName: 'HEYTEA · 喜茶',           notes: 'Premium bubble tea — UGC heavy' },
    { platform: 'REDNOTE', handle: 'lululemon_cn',      displayName: 'lululemon China',          notes: 'Athleisure — yoga + fitness niche' },

    // Instagram — common competitors for SMB / DTC brands
    { platform: 'INSTAGRAM', handle: 'glossier',        displayName: 'Glossier',                 notes: 'Direct-to-consumer beauty benchmark' },
    { platform: 'INSTAGRAM', handle: 'overheardnewyork', displayName: 'Overheard New York',     notes: 'UGC + relatable humor — niche dominator' },
    { platform: 'INSTAGRAM', handle: 'allbirds',         displayName: 'Allbirds',                notes: 'Sustainable footwear DTC' },

    // TikTok — the platform where bursty competitors emerge fastest
    { platform: 'TIKTOK', handle: 'duolingo',           displayName: 'Duolingo',                 notes: 'Mascot-driven content; high virality' },
    { platform: 'TIKTOK', handle: 'ryanair',            displayName: 'Ryanair',                  notes: 'Brand-personality account' },
    { platform: 'TIKTOK', handle: 'gymshark',           displayName: 'Gymshark',                 notes: 'Fitness apparel — community amplification' },
  ];

  let added = 0;
  let backfilled = 0;

  for (const s of samples) {
    const handle = s.handle.toLowerCase();
    const competitor = await prisma.competitor.upsert({
      where: {
        workspaceId_platform_handle: {
          workspaceId: ws.id,
          platform: s.platform,
          handle,
        },
      },
      update: { displayName: s.displayName, notes: s.notes },
      create: {
        workspaceId: ws.id,
        platform: s.platform,
        handle,
        displayName: s.displayName,
        notes: s.notes,
      },
    });
    added++;

    // Backfill 30 days of snapshots if competitor has no snapshots yet
    const existingSnapshots = await prisma.competitorSnapshot.count({
      where: { competitorId: competitor.id },
    });
    if (existingSnapshots === 0) {
      await backfillCompetitor(competitor.id, s.platform);
      backfilled++;
    }
  }

  console.log(`✅ Seeded ${added} competitors, backfilled ${backfilled}× 30-day snapshot history.`);
}

async function backfillCompetitor(competitorId: string, platform: SocialPlatform) {
  const ranges: Record<string, [number, number]> = {
    INSTAGRAM: [200_000, 2_500_000],
    TIKTOK:    [500_000, 8_000_000],
    REDNOTE:   [100_000, 900_000],
    YOUTUBE:   [80_000, 1_500_000],
    LINKEDIN:  [20_000, 400_000],
    FACEBOOK:  [50_000, 1_000_000],
  };
  const [min, max] = ranges[platform] ?? [50_000, 200_000];
  let followers = Math.floor(min + Math.random() * (max - min));
  let er = 0.025 + Math.random() * 0.075;
  let posts = 100 + Math.floor(Math.random() * 200);

  const topPostsByPlatform: Record<string, string[]> = {
    INSTAGRAM: [
      'New collection drop carousel — 47k saves, 12k DM shares',
      'Founder BTS Reel — 280k views, 8.4% completion',
      'UGC repost feature — 18k likes, 1.2k comments',
    ],
    TIKTOK: [
      '60-sec trend remix — 1.4M views, 22% completion',
      'Tutorial with trending audio — 412k views',
      '"Did you know" educational — 580k views',
    ],
    REDNOTE: [
      '"必买清单" (must-buy list) — 23k 收藏, CES 178',
      'Product review with before/after — 41k 点赞, 1.1k comments',
      'KOC unboxing repost — 18k 收藏',
    ],
    YOUTUBE: [
      '"5 mistakes new buyers make" — 380k views',
      'Product launch keynote — 145k views, 11min avg watch',
      'Behind-the-scenes Short — 2.1M views',
    ],
    LINKEDIN: [
      'Leadership thought-piece — 18k impressions, 240 comments',
      'Customer success story — 12k impressions',
      'Hiring announcement — 8k impressions, 95 shares',
    ],
    FACEBOOK: [
      'Live product demo — 92k views',
      'Carousel ad creative — 320k impressions',
      'Community group post — 4.5k reactions',
    ],
  };

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  for (let i = 30; i >= 0; i--) {
    const dailyGrowth = 0.0008 + Math.random() * 0.0035;
    followers = Math.round(followers * (1 + dailyGrowth));
    er = Math.max(0.005, Math.min(0.18, er + (Math.random() * 0.005 - 0.0025)));
    if (Math.random() > 0.4) posts++;

    await prisma.competitorSnapshot.create({
      data: {
        competitorId,
        capturedAt: new Date(now - i * day),
        followerCount: followers,
        postCount: posts,
        engagementRate: er,
        topPostsJson: i === 0 ? { top3: topPostsByPlatform[platform] ?? [] } : undefined,
        extra: { source: 'seed-backfill' },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
