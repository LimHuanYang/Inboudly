import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CommentIntent, CommentReplyStatus } from '@inboudly/database';
import { CommentIntelligenceService } from './comment-intelligence.service';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private intel: CommentIntelligenceService,
  ) {}

  list(workspaceId: string, filters: { intent?: CommentIntent; replyStatus?: CommentReplyStatus }) {
    return this.prisma.comment.findMany({
      where: {
        socialAccount: { workspaceId },
        ...(filters.intent && { intent: filters.intent }),
        ...(filters.replyStatus && { replyStatus: filters.replyStatus }),
      },
      include: { socialAccount: true, replies: true },
      orderBy: { postedAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Real intent-aware reply suggestions backed by the workspace's BYOK AI +
   * brand voice. Replaces the Phase 1 stub that returned hardcoded strings.
   */
  suggestReplies(workspaceId: string, commentId: string) {
    return this.intel.suggestReplies(workspaceId, commentId);
  }

  /**
   * Classify a comment (intent + sentiment + confidence) and persist the
   * result back to the row.
   */
  classify(workspaceId: string, commentId: string) {
    return this.intel.classify(workspaceId, commentId);
  }

  /**
   * Bulk classify — handy for "Analyse all unclassified" inbox button.
   */
  classifyBatch(workspaceId: string, commentIds: string[]) {
    return this.intel.classifyBatch(workspaceId, commentIds);
  }
}
