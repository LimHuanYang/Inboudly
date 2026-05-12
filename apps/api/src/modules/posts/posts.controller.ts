import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CreatePostSchema } from '@inboudly/shared';
import { PostStatus } from '@inboudly/database';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private posts: PostsService, private workspaces: WorkspacesService) {}

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: { supabaseUserId: string }) {
    const input = CreatePostSchema.parse(body);
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
  get(@Param('id') id: string) {
    return this.posts.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.posts.update(id, body);
  }

  @Post(':id/schedule')
  schedule(@Param('id') id: string, @Body() body: { scheduledFor: string }) {
    return this.posts.schedule(id, new Date(body.scheduledFor));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.posts.cancel(id);
  }
}
