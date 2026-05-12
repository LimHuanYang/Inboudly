import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ViralityScoreService } from './virality-score.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';

@ApiTags('intelligence')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('intelligence')
export class IntelligenceController {
  constructor(private virality: ViralityScoreService) {}

  @Post('virality-score')
  score(@Body() body: any) {
    return this.virality.score({
      variants: body.variants,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
    });
  }
}
