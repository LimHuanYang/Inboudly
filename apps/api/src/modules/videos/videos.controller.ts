import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FacelessVideoService } from './faceless-video.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

@ApiTags('videos')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('videos')
export class VideosController {
  constructor(
    private videos: FacelessVideoService,
    private workspaces: WorkspacesService,
  ) {}

  /** Static — list of preset niches the user can pick when creating a project. */
  @Get('niches')
  niches() {
    return this.videos.listNiches();
  }

  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.videos.list(workspaceId);
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.videos.getProject(id, workspaceId);
  }

  @Post()
  async create(
    @Body() body: { workspaceId: string; niche: string; topic: string; trendId?: string | null },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.videos.createProject({
      workspaceId: body.workspaceId,
      niche: body.niche,
      topic: body.topic,
      trendId: body.trendId,
    });
  }

  @Post(':id/regenerate-script')
  async regenerate(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    await this.videos.generateScript(id, body.workspaceId);
    return this.videos.getProject(id, body.workspaceId);
  }

  @Post(':id/generate-voice')
  async generateVoice(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    // Run in-band — ~5-10 sec per scene. v3 will move to Bull queue.
    await this.videos.generateVoiceAll(id, body.workspaceId);
    return this.videos.getProject(id, body.workspaceId);
  }

  @Post('scenes/:sceneId/generate-voice')
  async generateSceneVoice(
    @Param('sceneId') sceneId: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.videos.generateSceneVoice(sceneId, body.workspaceId);
  }

  @Patch('scenes/:sceneId')
  async updateScene(
    @Param('sceneId') sceneId: string,
    @Body() body: {
      workspaceId: string;
      text?: string;
      visualPrompt?: string;
      durationSec?: number;
    },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.videos.updateScene(sceneId, body.workspaceId, {
      text: body.text,
      visualPrompt: body.visualPrompt,
      durationSec: body.durationSec,
    });
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    await this.videos.deleteProject(id, workspaceId);
    return { ok: true };
  }
}
