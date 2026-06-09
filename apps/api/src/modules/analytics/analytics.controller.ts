import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private analytics: AnalyticsService,
    private workspaces: WorkspacesService,
  ) {}

  @Get('overview')
  async overview(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
    @Query('days') days?: string,
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.analytics.overview(workspaceId, days ? Number(days) : 30);
  }

  /** GET /analytics/posts — latest metrics per publication for the workspace. */
  @Get('posts')
  async postMetrics(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.analytics.postMetrics(workspaceId);
  }

  /** GET /analytics/timeseries?days= — daily summed engagement. */
  @Get('timeseries')
  async timeseries(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
    @Query('days') days?: string,
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.analytics.engagementTimeseries(workspaceId, days ? Number(days) : 30);
  }

  /** POST /analytics/refresh — enqueue an analytics pull for the workspace. */
  @Post('refresh')
  @HttpCode(202)
  async refresh(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.analytics.enqueueRefresh(workspaceId);
  }
}
