import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

@ApiTags('brand')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('brand')
export class BrandController {
  constructor(private brand: BrandService, private workspaces: WorkspacesService) {}

  @Get('kits')
  async listKits(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.brand.listKits(workspaceId);
  }

  @Post('kits')
  async createKit(
    @Body() body: any,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.brand.createKit(body.workspaceId, body);
  }

  @Patch('kits/:id')
  updateKit(@Param('id') id: string, @Body() body: any) {
    return this.brand.updateKit(id, body);
  }

  @Get('voices')
  async listVoices(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.brand.listVoices(workspaceId);
  }

  @Post('voices')
  async createVoice(
    @Body() body: any,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(body.workspaceId, user.supabaseUserId);
    return this.brand.createVoice(body.workspaceId, body);
  }

  @Patch('voices/:id')
  updateVoice(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.brand.updateVoice(id, body);
  }
}
