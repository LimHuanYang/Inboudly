import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
