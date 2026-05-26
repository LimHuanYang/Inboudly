import { PrismaClient, type SocialPlatform, type TrendVelocity } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds ~50+ realistic trends across all 6 platforms and a wide category
 * range (fitness, finance, gaming, parenting, pets, automotive, crypto,
 * sustainability, food, travel, business, etc.) so Trend Radar shows useful
 * data immediately on first visit.
 *
 * Idempotent per-trend: skips any (workspaceId, platform, topic) tuple that
 * already exists. Safe to re-run after we add more trends in future updates —
 * only the new ones get inserted.
 */
async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: 'main' } });
  if (!ws) {
    console.error('No demo workspace found. Run `pnpm db:seed` first.');
    process.exit(1);
  }
  console.log(`Seeding trends into workspace "${ws.name}" (${ws.id})...`);

  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  type Seed = {
    platform: SocialPlatform;
    topic: string;
    category: string;
    description: string;
    velocity: TrendVelocity;
    freshnessScore: number;
    estimatedReach: number;
    suggestedAngles: string[];
    hashtags: string[];
    exampleHandles: string[];
  };

  const seeds: Seed[] = [
    // INSTAGRAM — DTC / lifestyle heavy
    {
      platform: 'INSTAGRAM',
      topic: '"Outfit math" carousel breakdowns',
      category: 'fashion',
      description: 'Brands and creators break down a single outfit by component cost + styling logic. Carousels get massive saves because they\'re reference material.',
      velocity: 'BREAKOUT',
      freshnessScore: 100,
      estimatedReach: 180000,
      suggestedAngles: [
        'Break down a customer\'s outfit using your products + budget alternatives',
        'Show same outfit in 3 price tiers ($, $$, $$$)',
        'Reverse engineer a competitor\'s viral outfit',
      ],
      hashtags: ['outfitmath', 'styleinspo', 'capsulewardrobe', 'ootd', 'fashionbreakdown'],
      exampleHandles: ['minimalcloset', 'thethriftedinfluencer', 'outfitformulas'],
    },
    {
      platform: 'INSTAGRAM',
      topic: '"Quiet luxury at home" interior reels',
      category: 'lifestyle',
      description: 'Restrained, neutral, texture-focused home aesthetic with slow camera pans. Heavy on shares and saves as inspiration boards.',
      velocity: 'RISING',
      freshnessScore: 92,
      estimatedReach: 240000,
      suggestedAngles: [
        'Style your product within a "quiet luxury" home corner',
        'Before/after a corner of someone\'s home using your products',
        'List 5 things to remove from your home for a quiet-luxury look',
      ],
      hashtags: ['quietluxury', 'slowliving', 'interiordesign', 'neutralhome', 'modernminimal'],
      exampleHandles: ['athenacalderone', 'studio.duggan', 'frenchforpineapple'],
    },
    {
      platform: 'INSTAGRAM',
      topic: 'POV: founder unboxing customer\'s first order',
      category: 'business',
      description: 'Authentic behind-the-scenes content where founders film themselves unboxing and shipping customer orders. Drives parasocial connection and DM shares.',
      velocity: 'SUSTAINED',
      freshnessScore: 80,
      estimatedReach: 95000,
      suggestedAngles: [
        'Film yourself shipping a first-time customer\'s order with a handwritten note',
        'Show the manufacturing → packaging journey in 30 sec',
        'POV: customer\'s reaction reel-stitched',
      ],
      hashtags: ['smallbusinessowner', 'foundersjourney', 'orderpacking', 'bts', 'femalefounder'],
      exampleHandles: ['glossier', 'partake.foods', 'rowingblazers'],
    },
    {
      platform: 'INSTAGRAM',
      topic: '"Ingredient deep dive" educational carousels',
      category: 'beauty',
      description: 'Long carousels (8-10 slides) explaining one active ingredient — what it does, who needs it, what it pairs with. Performs as evergreen save-bait.',
      velocity: 'SUSTAINED',
      freshnessScore: 75,
      estimatedReach: 140000,
      suggestedAngles: [
        'Deep-dive your hero ingredient with citations',
        '"What this does to your skin / hair / body" in plain English',
        'Compare your formulation to a competitor\'s',
      ],
      hashtags: ['skincareeducation', 'beautyscience', 'ingredients', 'cleanbeauty', 'skintok'],
      exampleHandles: ['theordinary', 'paulaschoice', 'drdrayzday'],
    },

    // TIKTOK — fast trends, audio-driven
    {
      platform: 'TIKTOK',
      topic: '"Things that just make sense" product montages',
      category: 'lifestyle',
      description: 'Quick-cut 15-30 sec montages set to trending audio showing 3-5 products solving small daily frustrations. Drives strong share rates.',
      velocity: 'BREAKOUT',
      freshnessScore: 100,
      estimatedReach: 850000,
      suggestedAngles: [
        '5 products under $20 that "just make sense" for your niche',
        '"POV: things that make my morning routine make sense"',
        'Customer testimonials in this format',
      ],
      hashtags: ['thingsthatmakesense', 'amazonfinds', 'tiktokmademebuyit', 'lifehack', 'productreview'],
      exampleHandles: ['amazonfinds.exe', 'tiktokmademebuyit', 'productfinder'],
    },
    {
      platform: 'TIKTOK',
      topic: '"Day in the life of a [niche] founder"',
      category: 'business',
      description: 'Documentary-style 60-sec videos following a founder through one workday. High completion rates and follower growth.',
      velocity: 'RISING',
      freshnessScore: 88,
      estimatedReach: 420000,
      suggestedAngles: [
        '"Day in the life of a [your niche] founder"',
        'Behind-the-scenes of a product launch day',
        'Honest hour-by-hour breakdown of running your business',
      ],
      hashtags: ['founderlife', 'dayinthelife', 'smallbusinesscheck', 'entrepreneur', 'startuplife'],
      exampleHandles: ['startupjourney', 'thefounderdiary', 'momtrepreneurs'],
    },
    {
      platform: 'TIKTOK',
      topic: '"Why I switched from X to Y" comparisons',
      category: 'tech',
      description: 'Honest comparison videos where creators explain ditching one tool/product for another. Very high comment engagement.',
      velocity: 'RISING',
      freshnessScore: 85,
      estimatedReach: 380000,
      suggestedAngles: [
        '"Why I switched from [competitor] to [you] after 6 months"',
        'Side-by-side feature comparison with your product',
        'Customer migration story',
      ],
      hashtags: ['producthunt', 'techtok', 'productivity', 'switchedfrom', 'honestreview'],
      exampleHandles: ['producttesters', 'techreviewdaily', 'softwarediaries'],
    },
    {
      platform: 'TIKTOK',
      topic: '"Green flag / red flag" niche-specific reactions',
      category: 'education',
      description: 'Creators show common practices in their niche and react with green-flag / red-flag callouts. Drives saves + community comments.',
      velocity: 'SUSTAINED',
      freshnessScore: 72,
      estimatedReach: 290000,
      suggestedAngles: [
        'Green/red flags in [your industry]',
        'React to common mistakes your customers make',
        '"Things [your niche] should stop doing in 2026"',
      ],
      hashtags: ['greenflag', 'redflag', 'industryreact', 'unpopularopinion', 'professionaltips'],
      exampleHandles: ['careertok', 'financegirlies', 'realestatereactions'],
    },
    {
      platform: 'TIKTOK',
      topic: '"Get ready with me" while [doing X]',
      category: 'lifestyle',
      description: 'GRWM format extended to non-makeup contexts — "GRWM while I tell you about my launch", "GRWM for my first investor pitch". High dwell time.',
      velocity: 'SUSTAINED',
      freshnessScore: 78,
      estimatedReach: 510000,
      suggestedAngles: [
        '"GRWM while I tell you why I built [your product]"',
        '"GRWM for a customer demo"',
        '"GRWM while I share 3 lessons from this quarter"',
      ],
      hashtags: ['grwm', 'storytime', 'businessgrwm', 'casualtalk', 'authenticcontent'],
      exampleHandles: ['alixearle', 'mikaylanogueira', 'businessgrwm'],
    },

    // REDNOTE — long-form authentic, search-driven
    {
      platform: 'REDNOTE',
      topic: '"避雷指南" (avoidance guides) — what NOT to buy',
      category: 'lifestyle',
      description: '避雷 (avoid pitfalls) posts where users honestly list products that disappointed them. Counter-intuitively drives discovery as users search for honest reviews.',
      velocity: 'BREAKOUT',
      freshnessScore: 95,
      estimatedReach: 320000,
      suggestedAngles: [
        '"避雷" your competitors\' weak products + position yours as the answer',
        'Honest review showing where YOUR product has limitations',
        'Crowdsource "避雷 list" from your customers',
      ],
      hashtags: ['避雷指南', '踩雷分享', '亲测', '真实测评', '不踩雷'],
      exampleHandles: ['testmaster_rn', '种草避雷君', '理性消费'],
    },
    {
      platform: 'REDNOTE',
      topic: '"打工人" workday survival content',
      category: 'lifestyle',
      description: 'Office worker / urban professional lifestyle content with practical product recommendations. Office desk setup, lunch hacks, commute aesthetics.',
      velocity: 'RISING',
      freshnessScore: 90,
      estimatedReach: 280000,
      suggestedAngles: [
        '5 desk items every "打工人" needs (feature your products)',
        'Realistic morning routine for a 9-5',
        '"打工人午餐自救" lunch hacks with your products',
      ],
      hashtags: ['打工人', '办公室好物', '上班族', '通勤穿搭', '工位改造'],
      exampleHandles: ['上班族日记', '打工人聚集地', '工位美学'],
    },
    {
      platform: 'REDNOTE',
      topic: '"自律生活" self-discipline aesthetic',
      category: 'wellness',
      description: 'Highly aesthetic content around self-discipline routines — morning pages, gym schedules, meal prep. Performs well across beauty, wellness, productivity niches.',
      velocity: 'RISING',
      freshnessScore: 87,
      estimatedReach: 240000,
      suggestedAngles: [
        '"自律变美" routine featuring your beauty products',
        '"30-day self-improvement" challenge with your tools',
        'Aesthetic morning routine featuring product placement',
      ],
      hashtags: ['自律', '自律变美', '健康生活', '晨间routine', '自律打卡'],
      exampleHandles: ['自律小姐姐', '健康生活笔记', '21天习惯养成'],
    },
    {
      platform: 'REDNOTE',
      topic: '"性价比之王" budget-tier product comparisons',
      category: 'beauty',
      description: 'Searchable posts comparing your category\'s products by price-to-performance. RN users actively search for "性价比" — high evergreen discoverability.',
      velocity: 'SUSTAINED',
      freshnessScore: 76,
      estimatedReach: 195000,
      suggestedAngles: [
        '"百元内最好用" round-up with your product included',
        'Compare 3 price tiers (cheap / mid / luxury) — yours wins value',
        '"学生党必备" affordable picks',
      ],
      hashtags: ['性价比之王', '平价好物', '学生党', '百元内', '良心推荐'],
      exampleHandles: ['平价测评家', '学生党购物', '理性消费'],
    },

    // YOUTUBE — longer-form
    {
      platform: 'YOUTUBE',
      topic: '"I tried X for 30 days" challenge longforms',
      category: 'lifestyle',
      description: 'Documentary-style 8-15 min videos following one person trying a product/routine for a set period. Massive watch time + retention.',
      velocity: 'SUSTAINED',
      freshnessScore: 82,
      estimatedReach: 450000,
      suggestedAngles: [
        '"I used [your product] for 30 days — here\'s what happened"',
        'Send your product to a creator + film their experience',
        'Founder challenges themselves to use one product daily',
      ],
      hashtags: ['30daychallenge', 'productreview', 'experiment', 'beforeafter', 'honestreview'],
      exampleHandles: ['MattDAvella', 'thetakeoutbox', 'CleoAbram'],
    },
    {
      platform: 'YOUTUBE',
      topic: 'YouTube Shorts: "watch me _____ in 60 seconds"',
      category: 'education',
      description: 'Tight 60-sec process videos showing one specific skill or hack. Algorithm-friendly Shorts that funnel viewers to longform.',
      velocity: 'RISING',
      freshnessScore: 86,
      estimatedReach: 620000,
      suggestedAngles: [
        '"Watch me set up [your product] in 60 seconds"',
        'Quick 60-sec tutorials using your product',
        'Before/after transformations',
      ],
      hashtags: ['shorts', 'youtubeshorts', 'tutorial', 'howto', 'quicktip'],
      exampleHandles: ['MrBeast', 'Casey_Neistat', 'AliAbdaal'],
    },

    // LINKEDIN — B2B / thought leadership
    {
      platform: 'LINKEDIN',
      topic: '"Counter-intuitive lesson" founder posts',
      category: 'business',
      description: 'Founders share a counter-intuitive lesson learned the hard way. Massive comment engagement → algorithm boost.',
      velocity: 'SUSTAINED',
      freshnessScore: 80,
      estimatedReach: 85000,
      suggestedAngles: [
        '"The counter-intuitive thing we learned scaling to $1M ARR"',
        '"We thought X mattered. It didn\'t. Here\'s what did."',
        'Reverse hot-takes about your industry',
      ],
      hashtags: ['leadership', 'startuplessons', 'foundermode', 'b2bmarketing', 'lessonslearned'],
      exampleHandles: ['justinwelsh', 'lara_acosta', 'samparr'],
    },
    {
      platform: 'LINKEDIN',
      topic: '"Hot take" carousels with charts',
      category: 'business',
      description: 'Visual carousel posts with bold contrarian takes backed by data + charts. High share rate among professional networks.',
      velocity: 'RISING',
      freshnessScore: 88,
      estimatedReach: 110000,
      suggestedAngles: [
        'Data-backed contrarian take about your industry',
        '"Everyone says X. Here\'s why Y is actually true."',
        'Internal benchmark chart you can share publicly',
      ],
      hashtags: ['linkedincreator', 'hottake', 'b2bsales', 'industryinsights', 'datavisualization'],
      exampleHandles: ['chrisdo', 'theamandanat', 'jasonlk'],
    },

    // FACEBOOK — community-driven
    {
      platform: 'FACEBOOK',
      topic: 'Local community group "ask for recommendations"',
      category: 'lifestyle',
      description: 'Active local FB groups where users ask for recommendations daily. Strategic value: get featured organically in answer threads.',
      velocity: 'SUSTAINED',
      freshnessScore: 70,
      estimatedReach: 45000,
      suggestedAngles: [
        'Build relationships in 3-5 relevant local groups',
        'Answer "ask for recs" posts authentically when your product fits',
        'Run a sponsored community building campaign',
      ],
      hashtags: ['localbusiness', 'community', 'smallbiz', 'shoplocal', 'momsgroup'],
      exampleHandles: ['LocalMomsGroup', 'NeighborhoodSupport', 'CitySmallBizCollective'],
    },

    // ============================================================
    // EXPANSION PACK — broader categories: gaming, parenting, pets,
    // automotive, crypto, sustainability, finance, travel, food
    // ============================================================

    // --- INSTAGRAM (4 more) ---
    {
      platform: 'INSTAGRAM',
      topic: '"Receipt aesthetic" purchase justification posts',
      category: 'finance',
      description: 'Carousel screenshots of receipts with annotations explaining each purchase — "worth it / not worth it / would buy again". Shockingly high save rates.',
      velocity: 'BREAKOUT',
      freshnessScore: 96,
      estimatedReach: 165000,
      suggestedAngles: [
        'Annotate a customer\'s monthly receipts featuring your product',
        '"Reciept review: $200 at [your store] — what was worth it"',
        'Honest cost breakdown of using your service for 30 days',
      ],
      hashtags: ['receiptaesthetic', 'budgetbreakdown', 'moneydiaries', 'spendingreview', 'finance'],
      exampleHandles: ['moneywithkatie', 'thefinancialdiet', 'receipts.review'],
    },
    {
      platform: 'INSTAGRAM',
      topic: 'Pet "day in the life" vlogs',
      category: 'pets',
      description: 'POV-style vlogs from a pet\'s perspective. Heavily over-indexed on engagement — anthropomorphizing pets converts followers fast.',
      velocity: 'SUSTAINED',
      freshnessScore: 78,
      estimatedReach: 290000,
      suggestedAngles: [
        '"Day in the life of [pet name] using [your product]"',
        'POV: your dog reviews your pet treats',
        'Mascot-style content if your brand has a pet ambassador',
      ],
      hashtags: ['petsofinstagram', 'doglife', 'catsofinstagram', 'dayinthelife', 'petcontent'],
      exampleHandles: ['nala_cat', 'jiffpom', 'tunameltsmyheart'],
    },
    {
      platform: 'INSTAGRAM',
      topic: 'Travel "anti-itinerary" posts',
      category: 'travel',
      description: 'Travel creators sharing what to AVOID in popular destinations — overrated restaurants, tourist traps, time-wasters. Counter-programming wins.',
      velocity: 'RISING',
      freshnessScore: 89,
      estimatedReach: 220000,
      suggestedAngles: [
        '"Skip these 5 things in [destination]" if you ship travel-relevant products',
        'Local-vs-tourist comparison framing',
        'Map carousel with annotated "skip" pins',
      ],
      hashtags: ['traveltips', 'antitourist', 'localguide', 'travelmistakes', 'wanderlust'],
      exampleHandles: ['itskailasanyc', 'jess.wandering', 'travelwithcoco'],
    },
    {
      platform: 'INSTAGRAM',
      topic: '"Slow morning" cooking reels',
      category: 'food',
      description: '3-5 minute Reels of meditative breakfast prep — pour-over coffee, sourdough toast, eggs. ASMR-leaning food content with major save rates.',
      velocity: 'SUSTAINED',
      freshnessScore: 82,
      estimatedReach: 340000,
      suggestedAngles: [
        'Slow-morning recipe featuring your kitchen product',
        'Sound-on cooking reel emphasizing texture/sizzle',
        'Calming ingredient prep with voiceover',
      ],
      hashtags: ['slowmornings', 'breakfastreels', 'cookingasmr', 'foodreels', 'mindfuleating'],
      exampleHandles: ['carolinegelen', 'kalejunkie', 'baking_emilyy'],
    },

    // --- TIKTOK (4 more) ---
    {
      platform: 'TIKTOK',
      topic: 'Gaming "first hour" reactions',
      category: 'gaming',
      description: 'Streamers and casual players film their first hour with a new game and react authentically. Massive watch time during AAA launch windows.',
      velocity: 'BREAKOUT',
      freshnessScore: 94,
      estimatedReach: 920000,
      suggestedAngles: [
        '"First hour with [new game]" — leverage launch hype',
        'Compare your reaction to streamer expectations',
        'Discover hidden mechanics in real-time',
      ],
      hashtags: ['gamingtiktok', 'firstreaction', 'newgame', 'gamerlife', 'streamer'],
      exampleHandles: ['ninja', 'pokimane', 'sykkuno'],
    },
    {
      platform: 'TIKTOK',
      topic: '"Crypto explained badly" short skits',
      category: 'crypto',
      description: 'Comedic 30-sec skits explaining DeFi/NFT/Web3 concepts using bad analogies. Performs well because it makes confusing topics shareable.',
      velocity: 'RISING',
      freshnessScore: 86,
      estimatedReach: 480000,
      suggestedAngles: [
        '"Explaining [crypto concept] like you\'re 5"',
        'Skit format: 2 characters, one knows, one doesn\'t',
        '"What [your crypto product] actually does in plain English"',
      ],
      hashtags: ['cryptotok', 'web3explained', 'defi', 'cryptoeducation', 'nft'],
      exampleHandles: ['humphreytalks', 'wendyo', 'milesdeutscher'],
    },
    {
      platform: 'TIKTOK',
      topic: 'Parenting "things they don\'t tell you" series',
      category: 'parenting',
      description: 'New parents share unfiltered realities of early parenting. Generates huge comment sections from other parents — algorithm gold.',
      velocity: 'SUSTAINED',
      freshnessScore: 80,
      estimatedReach: 560000,
      suggestedAngles: [
        '"Things nobody tells you about [parenting milestone]"',
        'Product-as-saviour story (your product solving a real parenting pain)',
        'Stitch reaction format with another parent\'s post',
      ],
      hashtags: ['parentingtiktok', 'momtok', 'newmom', 'parentingtips', 'momsoftiktok'],
      exampleHandles: ['themamatrenches', 'taylor_wolfe', 'illymonster'],
    },
    {
      platform: 'TIKTOK',
      topic: '"Car detailing satisfying" before/afters',
      category: 'automotive',
      description: '60-second car detailing transformations with ASMR audio. Crosses over from automotive to general lifestyle audiences.',
      velocity: 'SUSTAINED',
      freshnessScore: 76,
      estimatedReach: 380000,
      suggestedAngles: [
        'Detail a customer\'s neglected car using your cleaning product',
        'Before/after with on-screen time-elapsed counter',
        '"Worst car I\'ve ever cleaned" hook',
      ],
      hashtags: ['cardetailing', 'satisfying', 'cleantok', 'autodetailing', 'beforeafter'],
      exampleHandles: ['detailgeek', 'thedetailgeek', 'larrykosilla'],
    },

    // --- REDNOTE (4 more) ---
    {
      platform: 'REDNOTE',
      topic: '"宝宝必备" baby essentials checklists',
      category: 'parenting',
      description: 'New-mom curated checklists of baby essentials. RN moms search heavily for these — extremely evergreen + high-conversion.',
      velocity: 'RISING',
      freshnessScore: 88,
      estimatedReach: 310000,
      suggestedAngles: [
        '"0-3个月宝宝必备" checklist featuring your products',
        'Price-tiered version (cheap / mid / premium)',
        '"踩雷宝宝用品" — what NOT to buy',
      ],
      hashtags: ['宝宝必备', '新手妈妈', '母婴好物', '育儿', '宝宝用品'],
      exampleHandles: ['新手妈妈日记', '宝宝种草', '育儿小专家'],
    },
    {
      platform: 'REDNOTE',
      topic: '"宠物日常" pet daily vlogs',
      category: 'pets',
      description: 'Slice-of-life pet vlogs in RN\'s soft aesthetic. Pet content has exploded on RN — high engagement across demographics.',
      velocity: 'BREAKOUT',
      freshnessScore: 92,
      estimatedReach: 270000,
      suggestedAngles: [
        '"猫咪/狗狗一天" vlog featuring your pet products',
        'Pet "review" of your product (humorous frame)',
        'Pet vs product comparison content',
      ],
      hashtags: ['宠物日常', '撸猫', '撸狗', '宠物用品', '萌宠'],
      exampleHandles: ['猫咪日记rn', '狗狗生活', '萌宠分享'],
    },
    {
      platform: 'REDNOTE',
      topic: '"穷游攻略" budget travel guides',
      category: 'travel',
      description: 'Detailed budget travel breakdowns with exact costs in RMB. RN users love specific, actionable guides over inspiration posts.',
      velocity: 'SUSTAINED',
      freshnessScore: 79,
      estimatedReach: 245000,
      suggestedAngles: [
        '"3000元玩转[城市]" detailed cost breakdown',
        'Hidden gems vs tourist traps comparison',
        'Solo-female traveler safety guide',
      ],
      hashtags: ['穷游攻略', '旅游攻略', '小众旅行', '国内旅行', '旅行日记'],
      exampleHandles: ['穷游达人', '旅行小确幸', '背包客日记'],
    },
    {
      platform: 'REDNOTE',
      topic: '"健身房新手" beginner gym guides',
      category: 'fitness',
      description: 'Step-by-step gym tutorials for nervous beginners. Educational long-form is RN\'s sweet spot — saves drive long-tail discovery.',
      velocity: 'RISING',
      freshnessScore: 85,
      estimatedReach: 198000,
      suggestedAngles: [
        '"健身房第一天" complete beginner walkthrough',
        '7-day beginner workout plan featuring your gear',
        '"健身房尴尬时刻" relatable beginner mistakes',
      ],
      hashtags: ['健身打卡', '健身房新手', '增肌减脂', '健身教程', '减肥日记'],
      exampleHandles: ['健身小白日记', '撸铁少女', '健身教练Tony'],
    },

    // --- YOUTUBE (5 more) ---
    {
      platform: 'YOUTUBE',
      topic: '"Honest 6-month review" longform',
      category: 'tech',
      description: 'Tech reviewers waiting 6 months before reviewing — counter-positioning against day-one reviews. Builds credibility, high CTR.',
      velocity: 'RISING',
      freshnessScore: 87,
      estimatedReach: 380000,
      suggestedAngles: [
        '"6 months with [your product] — was it worth it?"',
        'Send units to creators with explicit 6-month embargo',
        'User-submitted long-term reviews compilation',
      ],
      hashtags: ['honestreview', 'longtermreview', 'techreview', '6monthslater', 'techtuber'],
      exampleHandles: ['MKBHD', 'mrwhosetheboss', 'iJustine'],
    },
    {
      platform: 'YOUTUBE',
      topic: 'Documentary-style brand origin stories',
      category: 'business',
      description: '15-25 min mini-documentaries about how niche brands started. High retention + brand love generator.',
      velocity: 'SUSTAINED',
      freshnessScore: 81,
      estimatedReach: 290000,
      suggestedAngles: [
        'Document your own founding story with film-quality production',
        'Feature one of your B2B customers\' origin story',
        '"How [your industry] actually works" explainer',
      ],
      hashtags: ['minidocumentary', 'foundersstory', 'businessstory', 'brandhistory', 'startup'],
      exampleHandles: ['ColdFusion', 'WendoverProductions', 'JohnnyHarris'],
    },
    {
      platform: 'YOUTUBE',
      topic: 'Sustainable living transformation series',
      category: 'sustainability',
      description: 'Multi-part series following someone\'s journey to zero-waste / sustainable lifestyle. Strong community + repeat viewership.',
      velocity: 'RISING',
      freshnessScore: 84,
      estimatedReach: 215000,
      suggestedAngles: [
        '"I tried zero waste for 30 days" challenge series',
        'Audit a creator\'s home for sustainability swaps featuring your eco products',
        'Cost analysis: sustainable vs conventional over 1 year',
      ],
      hashtags: ['zerowaste', 'sustainableliving', 'ecofriendly', 'lowwaste', 'minimalism'],
      exampleHandles: ['shelbizleee', 'sustainablysavvy', 'gittemary'],
    },
    {
      platform: 'YOUTUBE',
      topic: '"Build with me" longform gaming streams',
      category: 'gaming',
      description: '2-4 hour relaxed building gameplay (Minecraft, Stardew, city builders). High dwell time, ad-friendly, comfortable for sponsors.',
      velocity: 'SUSTAINED',
      freshnessScore: 76,
      estimatedReach: 440000,
      suggestedAngles: [
        'Sponsor a "build with me" stream from a relevant creator',
        'Run a community-build challenge with your product as prize',
        'Stream your own build session if you have a gaming-adjacent product',
      ],
      hashtags: ['minecraft', 'stardewvalley', 'citybuilder', 'cozygaming', 'lofigaming'],
      exampleHandles: ['Grian', 'BdoubleO100', 'EthosLab'],
    },
    {
      platform: 'YOUTUBE',
      topic: 'Personal finance "FIRE journey" updates',
      category: 'finance',
      description: 'Creators sharing transparent monthly updates of their progress to Financial Independence. Trust-builder + recurring viewership.',
      velocity: 'SUSTAINED',
      freshnessScore: 78,
      estimatedReach: 195000,
      suggestedAngles: [
        '"How [your tool] helps my FIRE journey" sponsored integration',
        'Monthly portfolio breakdowns featuring relevant fintech products',
        '"Realistic FIRE on $60k salary" series',
      ],
      hashtags: ['fire', 'financialindependence', 'personalfinance', 'investing', 'frugalliving'],
      exampleHandles: ['OurRichJourney', 'AzulWells', 'GrahamStephan'],
    },

    // --- LINKEDIN (5 more) ---
    {
      platform: 'LINKEDIN',
      topic: '"Layoff lessons" founder honesty posts',
      category: 'business',
      description: 'Founders posting candidly about layoffs they\'ve done — what they\'d do differently. Massive engagement + sympathy from network.',
      velocity: 'RISING',
      freshnessScore: 86,
      estimatedReach: 145000,
      suggestedAngles: [
        '"What I learned doing 3 rounds of layoffs"',
        '"Why we\'re hiring instead of laying off" counter-narrative',
        'Operator perspectives on humane offboarding',
      ],
      hashtags: ['layoffs', 'leadership', 'foundermode', 'startuplife', 'companybuilding'],
      exampleHandles: ['davegerhardt', 'jasonlk', 'lara_acosta'],
    },
    {
      platform: 'LINKEDIN',
      topic: '"AI changed my workflow" before/after',
      category: 'tech',
      description: 'Professionals showing concrete workflow comparisons — pre-AI vs post-AI productivity. Big shares within knowledge-worker networks.',
      velocity: 'BREAKOUT',
      freshnessScore: 93,
      estimatedReach: 240000,
      suggestedAngles: [
        '"My [job role] workflow before and after [your AI product]"',
        'Time-saved infographic for one specific task',
        'Customer testimonial in this format',
      ],
      hashtags: ['ai', 'productivity', 'futureofwork', 'aitools', 'workflowoptimization'],
      exampleHandles: ['aakashg', 'mattshumer', 'shaanvp'],
    },
    {
      platform: 'LINKEDIN',
      topic: 'B2B SaaS pricing transparency posts',
      category: 'business',
      description: 'Founders explicitly sharing their pricing philosophy and numbers. Counter-cultural in B2B SaaS — generates massive trust.',
      velocity: 'RISING',
      freshnessScore: 87,
      estimatedReach: 115000,
      suggestedAngles: [
        '"Why we [raised/lowered] prices — here\'s the data"',
        'Cost-to-serve breakdown for transparency',
        'Public pricing experiment with results shared',
      ],
      hashtags: ['saaspricing', 'b2b', 'transparency', 'pricingstrategy', 'founderlife'],
      exampleHandles: ['ari_lewis_', 'thejasonsmith', 'jordan_t_walker'],
    },
    {
      platform: 'LINKEDIN',
      topic: 'Sustainability ROI case studies',
      category: 'sustainability',
      description: 'Real numbers on how sustainability initiatives drove revenue/savings/retention. Hard data + ESG angle = high B2B share rate.',
      velocity: 'SUSTAINED',
      freshnessScore: 75,
      estimatedReach: 92000,
      suggestedAngles: [
        '"How we cut [X] emissions and grew revenue [Y]%"',
        'B2B customer case study with sustainability angle',
        'Counter-narrative: "We tried green and it cost us — here\'s why"',
      ],
      hashtags: ['esg', 'sustainability', 'corporateresponsibility', 'climatech', 'b2bsustainability'],
      exampleHandles: ['paulhawken', 'kara_kara', 'climateinsider'],
    },
    {
      platform: 'LINKEDIN',
      topic: 'Recruiting "interview red flags" carousels',
      category: 'business',
      description: 'Both candidates and recruiters sharing red flags from interviews. High comment engagement + sharing across HR/recruiting networks.',
      velocity: 'RISING',
      freshnessScore: 84,
      estimatedReach: 168000,
      suggestedAngles: [
        '"5 interview red flags I ignored — and what they cost me"',
        '"What our hiring process actually looks like" transparency post',
        'Reframe: "Green flags candidates should look for"',
      ],
      hashtags: ['recruiting', 'hiring', 'careeradvice', 'interviewtips', 'redflags'],
      exampleHandles: ['ajstephanie', 'theroselle', 'careercoachjess'],
    },

    // --- FACEBOOK (5 more) ---
    {
      platform: 'FACEBOOK',
      topic: 'Reels: "Buy nothing group find" stories',
      category: 'sustainability',
      description: 'Users showcasing items they got free from Buy Nothing groups. Drives engagement across local/community-focused FB users.',
      velocity: 'RISING',
      freshnessScore: 82,
      estimatedReach: 88000,
      suggestedAngles: [
        'Founder participating in Buy Nothing groups + brand storytelling',
        '"Sustainable swap" content (your product replacing a single-use item)',
        'Local-first marketing in community group context',
      ],
      hashtags: ['buynothing', 'sustainability', 'community', 'reuse', 'localcommunity'],
      exampleHandles: ['buynothingproject', 'sustainabilityjess', 'zerowastemom'],
    },
    {
      platform: 'FACEBOOK',
      topic: 'Long-form "small business win" stories',
      category: 'business',
      description: '500-1000 word posts from small business owners sharing milestones. FB algorithm rewards long dwell time → great organic reach.',
      velocity: 'SUSTAINED',
      freshnessScore: 76,
      estimatedReach: 65000,
      suggestedAngles: [
        '"Today we hit [milestone]" detailed origin story post',
        'Customer-of-the-week deep dives',
        'Behind-the-scenes "what this milestone actually took"',
      ],
      hashtags: ['smallbusiness', 'foundersjourney', 'milestonesmatter', 'businessstory', 'shopsmall'],
      exampleHandles: ['SmallBizSundays', 'EntreLeaderHQ', 'FounderStories'],
    },
    {
      platform: 'FACEBOOK',
      topic: 'Live cooking demos for older demographic',
      category: 'food',
      description: 'FB Live cooking content tailored for 45+ audience — slower-paced, recipe-card friendly, comment-heavy.',
      velocity: 'SUSTAINED',
      freshnessScore: 74,
      estimatedReach: 110000,
      suggestedAngles: [
        'Weekly Live cooking demo featuring your kitchen/food products',
        'Reply-to-comments format for recipe adjustments',
        'Cross-promote with FB groups in your niche',
      ],
      hashtags: ['cooking', 'recipes', 'cookingshow', 'familydinner', 'comfortfood'],
      exampleHandles: ['TasteOfHome', 'PioneerWoman', 'TheKitchnDaily'],
    },
    {
      platform: 'FACEBOOK',
      topic: 'Reels: "Pet adoption success" stories',
      category: 'pets',
      description: 'Emotional adoption journey Reels with rescued pet narratives. Shares cross from pet community to general FB users.',
      velocity: 'RISING',
      freshnessScore: 88,
      estimatedReach: 195000,
      suggestedAngles: [
        'Sponsor adoption story Reels in partnership with local shelters',
        '"From shelter to family" content featuring your pet products',
        'Customer pet adoption stories aggregation',
      ],
      hashtags: ['adoptdontshop', 'rescuedog', 'rescuecat', 'petadoption', 'shelterlife'],
      exampleHandles: ['petsmartchairties', 'aspca', 'bestfriendsanimalsociety'],
    },
    {
      platform: 'FACEBOOK',
      topic: 'Marketplace "deal alert" community posts',
      category: 'finance',
      description: 'Members of local FB groups posting time-sensitive deals/coupons. High share rate among bargain-hunter demographic.',
      velocity: 'SUSTAINED',
      freshnessScore: 72,
      estimatedReach: 58000,
      suggestedAngles: [
        'Time-limited FB-group-exclusive offer',
        'Early-access deal sharing for community insiders',
        'Coupon strategy for FB-active customers',
      ],
      hashtags: ['dealalert', 'savings', 'coupons', 'discount', 'frugalliving'],
      exampleHandles: ['Slickdeals', 'TheKrazyCouponLady', 'WeMissTheRetail'],
    },
  ];

  // Per-trend idempotency: skip if a trend with the same (workspace, platform,
  // topic) already exists. This lets you safely re-run the seed after we add
  // more trends in future updates — only the new ones get inserted.
  let inserted = 0;
  let skipped = 0;
  for (const s of seeds) {
    const exists = await prisma.trend.findFirst({
      where: { workspaceId: ws.id, platform: s.platform, topic: s.topic },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.trend.create({
      data: {
        workspaceId: ws.id,
        platform: s.platform,
        topic: s.topic,
        category: s.category,
        description: s.description,
        velocity: s.velocity,
        freshnessScore: s.freshnessScore,
        estimatedReach: s.estimatedReach,
        suggestedAngles: s.suggestedAngles,
        hashtags: s.hashtags,
        exampleHandles: s.exampleHandles,
        source: 'MANUAL', // seed data — not AI-generated, not scraped
        expiresAt: sevenDays,
      },
    });
    inserted++;
  }

  const platforms = new Set(seeds.map((s) => s.platform)).size;
  console.log(
    `✅ Seeded ${inserted} new trends across ${platforms} platforms (skipped ${skipped} already-present).`,
  );
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
