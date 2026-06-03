import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../common/auth/auth.guard';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { GenerateVideoSchema } from '@inboudly/shared';
import { VideoGenerationService } from './video-generation.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai/video')
export class VideoGenerationController {
  constructor(
    private videos: VideoGenerationService,
    private workspaces: WorkspacesService,
  ) {}

  /** Start a video job. Returns the row immediately with status GENERATING. */
  @Post()
  async generate(
    @Body() body: unknown,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    const input = GenerateVideoSchema.parse(body);
    await this.workspaces.assertMember(input.workspaceId, user.supabaseUserId);
    return this.videos.create(input);
  }

  /** Poll a single job. */
  @Get(':id')
  async status(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.videos.get(id, workspaceId);
  }

  /** Recent jobs for the Generations tray. */
  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.videos.list(workspaceId);
  }
}
