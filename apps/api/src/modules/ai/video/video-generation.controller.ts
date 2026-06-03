import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../../common/auth/auth.guard';
import { GenerateVideoSchema } from '@inboudly/shared';
import { VideoGenerationService } from './video-generation.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('ai/video')
export class VideoGenerationController {
  constructor(private videos: VideoGenerationService) {}

  /** Start a video job. Returns the row immediately with status GENERATING. */
  @Post()
  async generate(@Body() body: unknown) {
    const input = GenerateVideoSchema.parse(body);
    return this.videos.create(input);
  }

  /** Poll a single job. */
  @Get(':id')
  async status(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return this.videos.get(id, workspaceId);
  }

  /** Recent jobs for the Generations tray. */
  @Get()
  async list(@Query('workspaceId') workspaceId: string) {
    return this.videos.list(workspaceId);
  }
}
