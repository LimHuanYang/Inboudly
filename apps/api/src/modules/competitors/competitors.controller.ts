import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CompetitorsService } from './competitors.service';
import { CompetitorSnapshotService } from './competitor-snapshot.service';
import { CompetitorAnalysisService } from './competitor-analysis.service';
import type { SocialPlatform } from '@inboudly/database';

@ApiTags('competitors')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('competitors')
export class CompetitorsController {
  constructor(
    private competitors: CompetitorsService,
    private snapshot: CompetitorSnapshotService,
    private analysis: CompetitorAnalysisService,
    private workspaces: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.competitors.list(workspaceId);
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.competitors.getById(id, workspaceId);
  }

  @Post()
  async add(
    @Body() body: {
      workspaceId: string;
      platform: SocialPlatform;
      handle: string;
      displayName?: string;
      avatarUrl?: string;
      notes?: string;
    },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    const created = await this.competitors.add(body.workspaceId, body);
    // Auto-backfill 30 days of mock snapshots so the new card has data
    await this.snapshot.backfill30Days(created.id);
    return created;
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.competitors.remove(id, workspaceId);
  }

  @Patch(':id/notes')
  async updateNotes(
    @Param('id') id: string,
    @Body() body: { workspaceId: string; notes: string | null },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.competitors.updateNotes(id, body.workspaceId, body.notes);
  }

  @Post(':id/snapshot')
  async snapshotOne(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    // Verify ownership before snapshot
    await this.competitors.getById(id, body.workspaceId);
    return this.snapshot.capture(id);
  }

  @Post('snapshot-all')
  async snapshotAll(
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.snapshot.captureAllInWorkspace(body.workspaceId);
  }

  @Post(':id/analyze-gap')
  async analyzeGap(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    await this.competitors.getById(id, body.workspaceId);
    return this.analysis.analyzeContentGap(body.workspaceId, id);
  }
}
