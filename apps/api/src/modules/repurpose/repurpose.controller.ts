import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RepurposeService } from './repurpose.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { RepurposeRequestSchema } from '@inboudly/shared';

@ApiTags('repurpose')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('repurpose')
export class RepurposeController {
  constructor(private repurpose: RepurposeService) {}

  @Post()
  submit(@Body() body: unknown) {
    const input = RepurposeRequestSchema.parse(body);
    return this.repurpose.submit(input);
  }

  @Get('jobs/:id')
  status(@Param('id') id: string) {
    return this.repurpose.status(id);
  }
}
