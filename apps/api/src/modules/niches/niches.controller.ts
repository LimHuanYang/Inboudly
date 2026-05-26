import {
  Body, Controller, Delete, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NicheIntelligenceService } from './niche-intelligence.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { SocialPlatform } from '@inboudly/database';

@ApiTags('niches')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('niches')
export class NichesController {
  constructor(
    private intel: NicheIntelligenceService,
    private workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.intel.list(workspaceId, limit ? Math.min(50, Number(limit)) : 20);
  }

  @Post('analyze')
  async analyze(
    @Body() body: {
      workspaceId: string;
      niche: string;
      platform?: SocialPlatform | null;
      force?: boolean;
    },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.intel.analyze(
      body.workspaceId,
      body.niche,
      body.platform ?? null,
      Boolean(body.force),
    );
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    await this.intel.deleteCached(workspaceId, id);
    return { ok: true };
  }
}
