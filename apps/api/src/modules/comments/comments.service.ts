import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CommentIntent, CommentReplyStatus } from '@inboudly/database';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

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

  // Phase 2 implementation: Claude-powered reply suggestion
  // For Phase 1, returns a stub — wired up so the UI surface exists.
  async suggestReplies(commentId: string): Promise<{ suggestions: string[] }> {
    void commentId;
    return {
      suggestions: [
        'Thanks for the kind words! 🙏',
        'Appreciate you sharing that.',
        'Glad this resonated — what part stood out most?',
      ],
    };
  }
}
