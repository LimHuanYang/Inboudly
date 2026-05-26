import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CommentIntent, CommentReplyStatus } from '@inboudly/database';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(
    private comments: CommentsService,
    private workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @Query('intent') intent: CommentIntent | undefined,
    @Query('replyStatus') replyStatus: CommentReplyStatus | undefined,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.comments.list(workspaceId, { intent, replyStatus });
  }

  /**
   * Reply suggestions — workspace-scoped so we can pull the brand voice
   * + BYOK key. Returns 3-4 intent-aware options with tone + rationale.
   */
  @Post(':id/suggest-replies')
  async suggest(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.comments.suggestReplies(body.workspaceId, id);
  }

  /**
   * Classify a single comment — detects intent + sentiment + confidence,
   * persists to the row. Returns derived urgency + AI reasoning.
   */
  @Post(':id/classify')
  async classify(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.comments.classify(body.workspaceId, id);
  }

  /**
   * Bulk classify — up to 50 comments per call. Returns per-comment results
   * + counts. Sequential under the hood (room for parallelisation later).
   */
  @Post('classify-batch')
  async classifyBatch(
    @Body() body: { workspaceId: string; commentIds: string[] },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.comments.classifyBatch(body.workspaceId, body.commentIds);
  }
}
