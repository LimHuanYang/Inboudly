import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { VoiceTrainingService } from './voice-training.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

@ApiTags('brand')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('brand')
export class BrandController {
  constructor(
    private brand: BrandService,
    private workspaces: WorkspacesService,
    private voiceTraining: VoiceTrainingService,
  ) {}

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

  // -------- Voice training (Pinecone embeddings) --------

  @Post('voices/:id/train')
  trainVoice(
    @Param('id') id: string,
    @Body()
    body: {
      examples: Array<{
        text: string;
        platform?: string;
        topic?: string;
        engagementScore?: number;
        sourcePostId?: string;
      }>;
    },
  ) {
    return this.voiceTraining.ingest(id, body.examples as any);
  }

  @Post('voices/:id/retrieve')
  retrieveExamples(@Param('id') id: string, @Body() body: { intent: string; topK?: number }) {
    return this.voiceTraining.retrieveExamples(id, body.intent, body.topK ?? 5);
  }

  @Delete('voices/:id/training')
  clearTraining(@Param('id') id: string) {
    return this.voiceTraining.clear(id);
  }
}
