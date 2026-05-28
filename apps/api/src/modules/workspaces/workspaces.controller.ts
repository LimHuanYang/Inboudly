import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { UserRole } from '@inboudly/database';

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: { supabaseUserId: string }) {
    return this.workspaces.listForUser(user.supabaseUserId);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: { supabaseUserId: string }) {
    return this.workspaces.getById(id, user.supabaseUserId);
  }

  @Patch(':id')
  updateSettings(
    @Param('id') id: string,
    @CurrentUser() user: { supabaseUserId: string },
    @Body() body: { currency?: string },
  ) {
    return this.workspaces.updateSettings(id, user.supabaseUserId, body);
  }

  @Post(':id/members')
  invite(
    @Param('id') id: string,
    @CurrentUser() user: { supabaseUserId: string },
    @Body() body: { email: string; role: UserRole },
  ) {
    return this.workspaces.invite(id, user.supabaseUserId, body.email, body.role);
  }
}
