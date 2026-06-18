import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus } from '@inboudly/database';
import type { CreatePostInput } from '@inboudly/shared';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  async create(supabaseUserId: string, input: CreatePostInput) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { supabaseUserId },
    });

    return this.prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          workspaceId: input.workspaceId,
          createdById: user.id,
          brandVoiceId: input.brandVoiceId,
          title: input.title,
          status: input.scheduledFor ? PostStatus.SCHEDULED : PostStatus.DRAFT,
          scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
          campaignTag: input.campaignTag,
          notes: input.notes,
          approvalRequired: input.approvalRequired,
        },
      });

      for (const v of input.variants) {
        const variant = await tx.postVariant.create({
          data: {
            postId: post.id,
            platform: v.platform,
            caption: v.caption,
            language: v.language,
            hashtags: v.hashtags,
            mentions: v.mentions,
            platformOptions: (v.platformOptions ?? {}) as never,
          },
        });

        for (const [idx, mediaAssetId] of v.mediaAssetIds.entries()) {
          await tx.postMedia.create({
            data: {
              postVariantId: variant.id,
              mediaAssetId,
              order: idx,
            },
          });
        }
      }

      return tx.post.findUniqueOrThrow({
        where: { id: post.id },
        include: { variants: { include: { media: true, publications: true } } },
      });
    });
  }

  async list(workspaceId: string, status?: PostStatus) {
    return this.prisma.post.findMany({
      where: { workspaceId, ...(status && { status }) },
      include: { variants: { include: { media: true } } },
      orderBy: [{ scheduledFor: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  }

  async getById(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        variants: { include: { media: { include: { mediaAsset: true } }, publications: true } },
        approvalWorkflow: { include: { steps: true } },
        internalComments: { include: { author: true } },
      },
    });
    if (!post) throw new NotFoundException();
    return post;
  }

  async update(id: string, data: Record<string, unknown>) {
    return this.prisma.post.update({ where: { id }, data });
  }

  async schedule(id: string, scheduledFor: Date) {
    return this.prisma.post.update({
      where: { id },
      data: { scheduledFor, status: PostStatus.SCHEDULED },
    });
  }

  async cancel(id: string) {
    return this.prisma.post.update({ where: { id }, data: { status: PostStatus.CANCELLED } });
  }

  async getWorkspaceId(id: string): Promise<string> {
    const post = await this.prisma.post.findUnique({ where: { id }, select: { workspaceId: true } });
    if (!post) throw new NotFoundException();
    return post.workspaceId;
  }

  /** Atomically flip a publishable post to PUBLISHING. Returns true if THIS call
   *  won the claim (so the caller should publish); false if it was already being
   *  published/published (prevents a publish-now vs cron double-fire). */
  async claimForPublish(id: string): Promise<boolean> {
    const res = await this.prisma.post.updateMany({
      where: { id, status: { in: [PostStatus.DRAFT, PostStatus.SCHEDULED, PostStatus.PARTIALLY_PUBLISHED, PostStatus.FAILED] } },
      data: { status: PostStatus.PUBLISHING },
    });
    return res.count === 1;
  }
}
