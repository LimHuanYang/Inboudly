import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus, Prisma } from '@inboudly/database';
import type { CreatePostInput } from '@inboudly/shared';

/** Statuses whose content can still be replaced — nothing has gone live yet. */
export const EDITABLE_STATUSES: PostStatus[] = [
  PostStatus.DRAFT,
  PostStatus.SCHEDULED,
  PostStatus.FAILED,
  PostStatus.CANCELLED,
];

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

      await this.writeVariants(tx, post.id, input.variants);

      return tx.post.findUniqueOrThrow({
        where: { id: post.id },
        include: { variants: { include: { media: true, publications: true } } },
      });
    });
  }

  /** Write a post's variants + their ordered media. Shared by create + updateContent. */
  private async writeVariants(
    tx: Prisma.TransactionClient,
    postId: string,
    variants: CreatePostInput['variants'],
  ) {
    for (const v of variants) {
      const variant = await tx.postVariant.create({
        data: {
          postId,
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
          data: { postVariantId: variant.id, mediaAssetId, order: idx },
        });
      }
    }
  }

  /**
   * Replace an editable post's content (variants + scalar fields). Guards on status:
   * only DRAFT / SCHEDULED / FAILED / CANCELLED can be edited (nothing is live yet).
   * Deleting variants cascades their media + publications; status is recomputed from
   * scheduledFor (SCHEDULED if set, else DRAFT — which clears a prior FAILED state).
   */
  async updateContent(id: string, input: CreatePostInput) {
    const existing = await this.prisma.post.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw new NotFoundException();
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new ConflictException(`A ${existing.status} post can't be edited.`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.postVariant.deleteMany({ where: { postId: id } });
      await tx.post.update({
        where: { id },
        data: {
          title: input.title,
          brandVoiceId: input.brandVoiceId,
          campaignTag: input.campaignTag,
          notes: input.notes,
          approvalRequired: input.approvalRequired,
          scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
          status: input.scheduledFor ? PostStatus.SCHEDULED : PostStatus.DRAFT,
        },
      });
      await this.writeVariants(tx, id, input.variants);
      return tx.post.findUniqueOrThrow({
        where: { id },
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
