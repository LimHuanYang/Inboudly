import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApprovalStatus, ApprovalMode, PostStatus } from '@inboudly/database';
import { randomBytes } from 'crypto';
import type { CreateApprovalWorkflowInput, ApproveOrRejectInput } from '@inboudly/shared';

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async create(input: CreateApprovalWorkflowInput) {
    const post = await this.prisma.post.findUnique({ where: { id: input.postId } });
    if (!post) throw new NotFoundException('Post not found');

    const shareableToken = input.generateShareableLink
      ? randomBytes(24).toString('hex')
      : undefined;

    return this.prisma.$transaction(async (tx) => {
      const workflow = await tx.approvalWorkflow.create({
        data: {
          postId: input.postId,
          workspaceId: post.workspaceId,
          mode: input.mode as ApprovalMode,
          shareableToken,
          shareableExpiresAt: shareableToken
            ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            : undefined,
          steps: {
            create: input.steps.map((s) => ({
              stepOrder: s.stepOrder,
              approverId: s.approverId,
              approverEmail: s.approverEmail,
            })),
          },
        },
        include: { steps: true },
      });

      await tx.post.update({
        where: { id: input.postId },
        data: { status: PostStatus.PENDING_APPROVAL, approvalRequired: true },
      });

      return workflow;
    });
  }

  async getByShareableToken(token: string) {
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { shareableToken: token },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        post: {
          include: { variants: { include: { media: { include: { mediaAsset: true } } } } },
        },
      },
    });
    if (!wf) throw new NotFoundException();
    if (wf.shareableExpiresAt && wf.shareableExpiresAt < new Date()) {
      throw new ForbiddenException('Shareable link expired');
    }
    return wf;
  }

  async decide(input: ApproveOrRejectInput, actorUserId?: string) {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: input.stepId },
      include: { workflow: true },
    });
    if (!step) throw new NotFoundException();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: input.decision as ApprovalStatus,
          comment: input.comment,
          decidedAt: new Date(),
        },
      });

      // If rejected/changes-requested, fail the workflow
      if (input.decision === 'REJECTED' || input.decision === 'CHANGES_REQUESTED') {
        await tx.approvalWorkflow.update({
          where: { id: step.workflowId },
          data: { status: input.decision as ApprovalStatus },
        });
        await tx.post.update({
          where: { id: step.workflow.postId },
          data: { status: PostStatus.DRAFT },
        });
        return updated;
      }

      // If all steps approved, advance the post
      const remaining = await tx.approvalStep.count({
        where: { workflowId: step.workflowId, status: ApprovalStatus.PENDING },
      });
      if (remaining === 0) {
        await tx.approvalWorkflow.update({
          where: { id: step.workflowId },
          data: { status: ApprovalStatus.APPROVED },
        });
        await tx.post.update({
          where: { id: step.workflow.postId },
          data: { status: PostStatus.APPROVED },
        });
      } else {
        await tx.approvalWorkflow.update({
          where: { id: step.workflowId },
          data: { currentStep: { increment: 1 } },
        });
      }
      return updated;
    });
  }
}
