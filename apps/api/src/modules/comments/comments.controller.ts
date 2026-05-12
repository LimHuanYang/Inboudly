import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CommentIntent, CommentReplyStatus } from '@inboudly/database';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private comments: CommentsService) {}

  @Get()
  list(
    @Query('workspaceId') workspaceId: string,
    @Query('intent') intent?: CommentIntent,
    @Query('replyStatus') replyStatus?: CommentReplyStatus,
  ) {
    return this.comments.list(workspaceId, { intent, replyStatus });
  }

  @Post(':id/suggest-replies')
  suggest(@Param('id') id: string) {
    return this.comments.suggestReplies(id);
  }
}
