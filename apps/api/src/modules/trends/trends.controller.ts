import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TrendRadarService } from './trend-radar.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { SocialPlatform, TrendVelocity } from '@inboudly/database';

@ApiTags('trends')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('trends')
export class TrendsController {
  constructor(
    private radar: TrendRadarService,
    private workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @Query('platform') platform: SocialPlatform | undefined,
    @Query('category') category: string | undefined,
    @Query('velocity') velocity: TrendVelocity | undefined,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.radar.list(workspaceId, { platform, category, velocity });
  }

  @Get(':id/composer-prompt')
  async composerPrompt(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.radar.getComposerPrompt(id, workspaceId);
  }

  @Post('generate')
  async generate(
    @Body() body: { workspaceId: string; platform: SocialPlatform; count?: number },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.radar.generate(body.workspaceId, body.platform, body.count);
  }

  @Post('refresh-all')
  async refreshAll(
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.radar.refreshAll(body.workspaceId);
  }

  @Patch(':id/dismiss')
  async dismiss(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.radar.dismiss(id, body.workspaceId);
  }
}
