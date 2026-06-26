import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../common/auth/auth.guard';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { GenerateVideoSchema, CreateTemplateVideoSchema, type GenerateVideoInput, type CreateTemplateVideoInput } from '@inboudly/shared';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { VideoGenerationService } from './video-generation.service';
import { WorkspacesService } from '../../workspaces/workspaces.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai/video')
export class VideoGenerationController {
  constructor(
    private videos: VideoGenerationService,
    private workspaces: WorkspacesService,
  ) {}

  /** Start a video job. Returns the row immediately with status GENERATING. */
  @Post()
  async generate(
    @Body(new ZodValidationPipe(GenerateVideoSchema)) input: GenerateVideoInput,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(input.workspaceId, user.supabaseUserId);
    return this.videos.create(input);
  }

  /** Start a HyperFrames branded-clip job. Polls the same way as /ai/video/:id. */
  @Post('template-video')
  async templateVideo(
    @Body(new ZodValidationPipe(CreateTemplateVideoSchema)) input: CreateTemplateVideoInput,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(input.workspaceId, user.supabaseUserId);
    return this.videos.createTemplateJob(input);
  }

  /** Poll a single job. */
  @Get(':id')
  async status(
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.videos.get(id, workspaceId);
  }

  /** Recent jobs for the Generations tray. */
  @Get()
  async list(
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.videos.list(workspaceId);
  }
}
