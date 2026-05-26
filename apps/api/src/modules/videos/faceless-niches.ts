/**
 * Faceless video niche presets — each preset shapes the script-generation
 * prompt so the output feels native to the niche. Adding a new niche is just
 * a new entry here: no other code changes needed.
 *
 * Picked by the user when creating a project; drives:
 *   - the hook style of the opening scene
 *   - target scene count + sentence pacing
 *   - voice tone hint (for v2 ElevenLabs voice selection)
 *   - visual style hint (for v2 Runway/Kling video gen)
 */

export interface FacelessNiche {
  slug: string;
  label: string;
  description: string;
  /** Sample prompt to show as input placeholder. */
  examplePrompt: string;
  /** Hook archetype the opening scene should follow. */
  hookStyle: string;
  /** Target scene count for a ~60-second video. */
  targetScenes: number;
  /** Voice tone hint — used in v2 to pick the ElevenLabs voice. */
  voiceTone: 'energetic' | 'calm' | 'authoritative' | 'mysterious' | 'conversational' | 'dramatic';
  /** Visual style hint for v2 video-gen prompts. */
  visualStyle: string;
}

export const FACELESS_NICHES: FacelessNiche[] = [
  {
    slug: 'motivational',
    label: 'Motivational',
    description: 'Quote-driven inspirational shorts with a punchy hook + payoff structure.',
    examplePrompt: 'Why most people give up right before success',
    hookStyle: '"Most people don\'t realise that…" or "The brutal truth about…"',
    targetScenes: 5,
    voiceTone: 'dramatic',
    visualStyle: 'cinematic slow-motion shots of nature, cityscapes at golden hour, lone figures',
  },
  {
    slug: 'fitness',
    label: 'Fitness tips',
    description: 'Quick exercise tips, form breakdowns, common-mistake callouts.',
    examplePrompt: 'The one mistake everyone makes on bench press',
    hookStyle: '"If your [exercise] isn\'t working, it\'s because…"',
    targetScenes: 4,
    voiceTone: 'energetic',
    visualStyle: 'gym shots, exercise demonstrations, anatomy diagrams, before/after splits',
  },
  {
    slug: 'history',
    label: 'History deep-dives',
    description: 'Lesser-known historical events, weird facts, hidden context.',
    examplePrompt: 'The Roman emperor who appointed his horse as senator',
    hookStyle: '"In [year], something happened that history forgot…"',
    targetScenes: 6,
    voiceTone: 'authoritative',
    visualStyle: 'historical paintings, sepia photos, period maps, archival footage, candlelight',
  },
  {
    slug: 'asmr',
    label: 'ASMR product showcase',
    description: 'Slow product reveals with satisfying close-ups and ambient sound.',
    examplePrompt: 'Unboxing our new ceramic knife',
    hookStyle: '"Watch what happens when…" or "The most satisfying [action]…"',
    targetScenes: 5,
    voiceTone: 'calm',
    visualStyle: 'macro close-ups, hands only, textured surfaces, soft natural light, slow pans',
  },
  {
    slug: 'productivity',
    label: 'Productivity hacks',
    description: 'Specific time-saving systems, tool tips, workflow improvements.',
    examplePrompt: 'The 2-minute rule that saved me 10 hours a week',
    hookStyle: '"Stop doing X. Start doing Y."',
    targetScenes: 5,
    voiceTone: 'conversational',
    visualStyle: 'screen recordings, time-lapse desk shots, sticky notes, calendar overlays',
  },
  {
    slug: 'money',
    label: 'Money & finance',
    description: 'Personal finance tips, investing concepts, money mistakes to avoid.',
    examplePrompt: 'Why your high-yield savings is still losing money',
    hookStyle: '"If you\'re doing X with your money, you\'re losing $Y per year"',
    targetScenes: 5,
    voiceTone: 'authoritative',
    visualStyle: 'cash flat-lays, chart overlays, calculator close-ups, real estate exteriors',
  },
  {
    slug: 'did-you-know',
    label: 'Did-you-know facts',
    description: 'Surprising bite-sized facts across science, nature, history, culture.',
    examplePrompt: 'Why octopuses have three hearts',
    hookStyle: '"Did you know that [surprising fact]?"',
    targetScenes: 4,
    voiceTone: 'conversational',
    visualStyle: 'high-quality nature footage, lab shots, microscope imagery, world maps',
  },
  {
    slug: 'conspiracy',
    label: 'Mysteries & conspiracies',
    description: 'Unexplained events, declassified files, "what really happened" deep-dives.',
    examplePrompt: 'The CIA experiment they tried to bury',
    hookStyle: '"What if I told you that…" or "The government doesn\'t want you to know…"',
    targetScenes: 6,
    voiceTone: 'mysterious',
    visualStyle: 'dim lighting, redacted documents, archival news clips, black-and-white footage',
  },
  {
    slug: 'mythology',
    label: 'Mythology & folklore',
    description: 'Greek/Norse/Egyptian/Asian mythology stories, gods, legendary creatures.',
    examplePrompt: 'The forgotten Greek hero who killed a god',
    hookStyle: '"Before Hercules, before Achilles, there was…"',
    targetScenes: 6,
    voiceTone: 'dramatic',
    visualStyle: 'classical paintings, ancient sculpture, atmospheric mountain/forest shots',
  },
  {
    slug: 'tech-explained',
    label: 'Tech explained simply',
    description: 'Complex tech concepts (AI, blockchain, quantum) explained in 60 seconds.',
    examplePrompt: 'How LLMs actually work (without the math)',
    hookStyle: '"Here\'s [tech concept] in 60 seconds…"',
    targetScenes: 5,
    voiceTone: 'conversational',
    visualStyle: 'animated diagrams, screen recordings, abstract data viz, glowing circuit boards',
  },
];

export function findNiche(slug: string): FacelessNiche | undefined {
  return FACELESS_NICHES.find((n) => n.slug === slug);
}
