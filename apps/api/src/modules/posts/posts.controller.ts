import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { PostPublisherService } from './post-publisher.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CreatePostSchema, type CreatePostInput } from '@inboudly/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PostStatus } from '@inboudly/database';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(
    private posts: PostsService,
    private workspaces: WorkspacesService,
    private publisher: PostPublisherService,
  ) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreatePostSchema)) input: CreatePostInput,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(input.workspaceId, user.supabaseUserId);
    return this.posts.create(user.supabaseUserId, input);
  }

  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @Query('status') status: PostStatus | undefined,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.posts.list(workspaceId, status);
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: { supabaseUserId: string }) {
    await this.assertPostMember(id, user.supabaseUserId);
    return this.posts.getById(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.assertPostMember(id, user.supabaseUserId);
    return this.posts.update(id, body);
  }

  @Post(':id/schedule')
  async schedule(
    @Param('id') id: string,
    @Body() body: { scheduledFor: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.assertPostMember(id, user.supabaseUserId);
    return this.posts.schedule(id, new Date(body.scheduledFor));
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: { supabaseUserId: string }) {
    await this.assertPostMember(id, user.supabaseUserId);
    return this.posts.cancel(id);
  }

  @Post(':id/publish-now')
  async publishNow(
    @Param('id') id: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.assertPostMember(id, user.supabaseUserId);
    const claim = await this.posts.claimForPublish(id);
    if (claim) await this.publisher.publishPost(id);
    return this.posts.getById(id);
  }

  private async assertPostMember(postId: string, supabaseUserId: string): Promise<void> {
    const workspaceId = await this.posts.getWorkspaceId(postId);
    await this.workspaces.assertMember(workspaceId, supabaseUserId);
  }
}
