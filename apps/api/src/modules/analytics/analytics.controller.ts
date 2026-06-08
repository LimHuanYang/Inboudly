import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('overview')
  overview(@Query('workspaceId') workspaceId: string, @Query('days') days?: string) {
    return this.analytics.overview(workspaceId, days ? Number(days) : 30);
  }

  /** GET /analytics/posts — latest metrics per publication for the workspace. */
  @Get('posts')
  postMetrics(@Query('workspaceId') workspaceId: string) {
    return this.analytics.postMetrics(workspaceId);
  }

  /** GET /analytics/timeseries?days= — daily summed engagement. */
  @Get('timeseries')
  timeseries(
    @Query('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ) {
    return this.analytics.engagementTimeseries(workspaceId, days ? Number(days) : 30);
  }

  /** POST /analytics/refresh — enqueue an analytics pull for the workspace. */
  @Post('refresh')
  @HttpCode(202)
  refresh(@Query('workspaceId') workspaceId: string) {
    return this.analytics.enqueueRefresh(workspaceId);
  }
}
