import { z } from 'zod';

// ============================================================
// AUTH
// ============================================================
export const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(100).optional(),
  workspaceName: z.string().min(1).max(100),
});
export type SignUpInput = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SignInInput = z.infer<typeof SignInSchema>;

// ============================================================
// WORKSPACE
// ============================================================
export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  timezone: z.string().default('UTC'),
  locale: z.string().default('en'),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;

// ============================================================
// POST COMPOSER
// ============================================================
export const SocialPlatformSchema = z.enum([
  'INSTAGRAM',
  'TIKTOK',
  'REDNOTE',
  'FACEBOOK',
  'LINKEDIN',
  'YOUTUBE',
  'X',
  'THREADS',
  'LEMON8',
  'PINTEREST',
]);

export const PostVariantInputSchema = z.object({
  platform: SocialPlatformSchema,
  caption: z.string().max(63206),
  language: z.string().default('en'),
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(z.string()).default([]),
  mediaAssetIds: z.array(z.string().cuid()).default([]),
  platformOptions: z.record(z.unknown()).optional(),
});

export const CreatePostSchema = z.object({
  workspaceId: z.string().cuid(),
  title: z.string().max(200).optional(),
  brandVoiceId: z.string().cuid().optional(),
  scheduledFor: z.string().datetime().optional(),
  campaignTag: z.string().optional(),
  notes: z.string().optional(),
  variants: z.array(PostVariantInputSchema).min(1),
  approvalRequired: z.boolean().default(false),
});
export type CreatePostInput = z.infer<typeof CreatePostSchema>;

// ============================================================
// AI GENERATION
// ============================================================
export const GenerateTextSchema = z.object({
  workspaceId: z.string().cuid(),
  brandVoiceId: z.string().cuid().optional(),
  platform: SocialPlatformSchema,
  prompt: z.string().min(1).max(4000),
  language: z.string().default('en'),
  variations: z.number().int().min(1).max(5).default(3),
  toneOverride: z.array(z.string()).optional(),
  includeHashtags: z.boolean().default(true),
  includeCta: z.boolean().default(true),
  referenceUrl: z.string().url().optional(),
});
export type GenerateTextInput = z.infer<typeof GenerateTextSchema>;

export const GenerateImageSchema = z.object({
  workspaceId: z.string().cuid(),
  prompt: z.string().min(1).max(2000),
  aspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9', '3:4', '2:3', '1.91:1']).default('1:1'),
  model: z.enum(['gpt-image-1', 'flux-pro-1.1', 'flux-schnell']).default('gpt-image-1'),
  brandKitId: z.string().cuid().optional(),
  count: z.number().int().min(1).max(4).default(1),
  referenceImageUrl: z.string().url().optional(),
});
export type GenerateImageInput = z.infer<typeof GenerateImageSchema>;

export const VideoProviderSchema = z.enum(['higgsfield']);
export type VideoProviderName = z.infer<typeof VideoProviderSchema>;

export const GenerateVideoSchema = z.object({
  workspaceId: z.string().cuid(),
  prompt: z.string().min(1).max(2000),
  durationSec: z.number().int().min(2).max(10).default(5),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
  // Omit to let the server resolve the workspace's default provider (Higgsfield).
  provider: VideoProviderSchema.optional(),
  // Free-form so each provider's model list can grow without a schema change.
  // Omit to use the server default for the resolved provider.
  model: z.string().trim().min(1).max(80).optional(),
  referenceImageUrl: z.string().url().optional(),
});
export type GenerateVideoInput = z.infer<typeof GenerateVideoSchema>;

// ============================================================
// REPURPOSE ENGINE
// ============================================================
export const RepurposeSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('upload'), mediaAssetId: z.string().cuid() }),
  z.object({ kind: z.literal('youtube'), url: z.string().url() }),
  z.object({ kind: z.literal('podcast'), url: z.string().url() }),
  z.object({ kind: z.literal('blog'), url: z.string().url() }),
]);

export const RepurposeRequestSchema = z.object({
  workspaceId: z.string().cuid(),
  source: RepurposeSourceSchema,
  targetPlatforms: z.array(SocialPlatformSchema).min(1),
  clipCount: z.number().int().min(1).max(20).default(5),
  burnInCaptions: z.boolean().default(true),
  autoReframe: z.boolean().default(true),
  brandVoiceId: z.string().cuid().optional(),
  brandKitId: z.string().cuid().optional(),
});
export type RepurposeRequest = z.infer<typeof RepurposeRequestSchema>;

// ============================================================
// PRE-PUBLISH INTELLIGENCE
// ============================================================
export const ViralityScoreResponseSchema = z.object({
  overallScore: z.number().min(0).max(100),
  perPlatform: z.array(
    z.object({
      platform: SocialPlatformSchema,
      score: z.number().min(0).max(100),
      predictedReach: z.number().int(),
      predictedEngagementRate: z.number(),
      coachingNotes: z.array(
        z.object({
          severity: z.enum(['info', 'suggestion', 'warning', 'critical']),
          message: z.string(),
          fix: z.string().optional(),
        }),
      ),
    }),
  ),
  multimodalCoherence: z.number().min(0).max(100).optional(),
});
export type ViralityScoreResponse = z.infer<typeof ViralityScoreResponseSchema>;

// ============================================================
// APPROVAL
// ============================================================
export const ApprovalStepInputSchema = z.object({
  approverId: z.string().cuid().optional(),
  approverEmail: z.string().email().optional(),
  stepOrder: z.number().int().min(0),
});

export const CreateApprovalWorkflowSchema = z.object({
  postId: z.string().cuid(),
  mode: z.enum(['NONE', 'OPTIONAL', 'REQUIRED', 'MULTI_LEVEL']).default('REQUIRED'),
  steps: z.array(ApprovalStepInputSchema).min(1),
  generateShareableLink: z.boolean().default(false),
});
export type CreateApprovalWorkflowInput = z.infer<typeof CreateApprovalWorkflowSchema>;

export const ApproveOrRejectSchema = z.object({
  workflowId: z.string().cuid(),
  stepId: z.string().cuid(),
  decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  comment: z.string().optional(),
});
export type ApproveOrRejectInput = z.infer<typeof ApproveOrRejectSchema>;
