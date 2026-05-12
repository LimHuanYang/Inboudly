export const APP_NAME = 'Inboudly';
export const APP_DESCRIPTION = 'AI-native social media intelligence platform';

export const PLAN_LIMITS = {
  STARTER: {
    socialAccounts: 3,
    users: 1,
    postsPerMonth: 100,
    aiCreditsPerMonth: 50_000,
    storageGb: 5,
    competitorTracking: false,
    kolDiscovery: false,
    approvalWorkflows: false,
    whiteLabel: false,
  },
  PRO: {
    socialAccounts: 10,
    users: 5,
    postsPerMonth: 500,
    aiCreditsPerMonth: 200_000,
    storageGb: 50,
    competitorTracking: false,
    kolDiscovery: false,
    approvalWorkflows: true,
    whiteLabel: false,
  },
  AGENCY: {
    socialAccounts: 50,
    users: 15,
    postsPerMonth: -1, // unlimited
    aiCreditsPerMonth: 1_000_000,
    storageGb: 250,
    competitorTracking: true,
    kolDiscovery: true,
    approvalWorkflows: true,
    whiteLabel: false,
  },
  WHITE_LABEL: {
    socialAccounts: -1,
    users: -1,
    postsPerMonth: -1,
    aiCreditsPerMonth: 5_000_000,
    storageGb: 1000,
    competitorTracking: true,
    kolDiscovery: true,
    approvalWorkflows: true,
    whiteLabel: true,
  },
  ENTERPRISE: {
    socialAccounts: -1,
    users: -1,
    postsPerMonth: -1,
    aiCreditsPerMonth: -1,
    storageGb: -1,
    competitorTracking: true,
    kolDiscovery: true,
    approvalWorkflows: true,
    whiteLabel: true,
  },
} as const;

export const AI_CREDIT_COSTS = {
  TEXT_GENERATION: 1,
  IMAGE_GENERATION: 10,
  IMAGE_EDIT: 8,
  VIDEO_GENERATION_5S: 100,
  VOICE_GENERATION_PER_MINUTE: 20,
  MUSIC_GENERATION_PER_TRACK: 50,
  TRANSCRIPTION_PER_MINUTE: 2,
  EMBEDDING: 1,
  REPURPOSE_PER_CLIP: 30,
} as const;
