import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { KolService, type KolSearchFilters } from './kol.service';
import { KolAnalysisService } from './kol-analysis.service';
import type { SocialPlatform } from '@inboudly/database';

@ApiTags('kol')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('kol')
export class KolController {
  constructor(
    private kol: KolService,
    private analysis: KolAnalysisService,
  ) {}

  @Get()
  search(
    @Query('platform') platform?: SocialPlatform,
    @Query('niche') niche?: string, // comma-separated
    @Query('language') language?: string,
    @Query('country') country?: string,
    @Query('minFollowers') minFollowers?: string,
    @Query('maxFollowers') maxFollowers?: string,
    @Query('minEngagementRate') minEngagementRate?: string,
    @Query('minAuthenticityScore') minAuthenticityScore?: string,
    @Query('q') searchQuery?: string,
    @Query('sortBy') sortBy?: KolSearchFilters['sortBy'],
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.kol.search({
      platform,
      niches: niche?.split(',').map((s) => s.trim()).filter(Boolean),
      language,
      country,
      minFollowers: minFollowers ? Number(minFollowers) : undefined,
      maxFollowers: maxFollowers ? Number(maxFollowers) : undefined,
      minEngagementRate: minEngagementRate ? Number(minEngagementRate) : undefined,
      minAuthenticityScore: minAuthenticityScore ? Number(minAuthenticityScore) : undefined,
      searchQuery,
      sortBy,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get('niches')
  listNiches(@Query('platform') platform?: SocialPlatform) {
    return this.kol.listNiches(platform);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.kol.getById(id);
  }

  @Post(':id/analyze')
  analyze(
    @Param('id') id: string,
    @Body() body: {
      workspaceId: string;
      postingTimeDistributionUtc?: Array<{ hourUtc: number; count: number }>;
      commentSample?: Array<{ text: string; language?: string }>;
    },
  ) {
    return this.analysis.analyze(body.workspaceId, id, {
      postingTimeDistributionUtc: body.postingTimeDistributionUtc,
      commentSample: body.commentSample,
    });
  }
}
