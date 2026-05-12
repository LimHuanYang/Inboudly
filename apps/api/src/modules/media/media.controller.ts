import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { MediaType } from '@inboudly/database';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private media: MediaService) {}

  @Post('upload-url')
  createUploadUrl(@Body() body: { workspaceId: string; filename: string; mimeType: string }) {
    return this.media.createUploadUrl(body.workspaceId, body.filename, body.mimeType);
  }

  @Post()
  register(@Body() body: any) {
    return this.media.register(body);
  }

  @Get()
  list(@Query('workspaceId') workspaceId: string, @Query('type') type?: MediaType) {
    return this.media.list(workspaceId, type);
  }
}
