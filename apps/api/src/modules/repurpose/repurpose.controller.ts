import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RepurposeService } from './repurpose.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { RepurposeRequestSchema, type RepurposeRequest } from '@inboudly/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('repurpose')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('repurpose')
export class RepurposeController {
  constructor(private repurpose: RepurposeService) {}

  @Post()
  submit(@Body(new ZodValidationPipe(RepurposeRequestSchema)) input: RepurposeRequest) {
    return this.repurpose.submit(input);
  }

  @Get('jobs/:id')
  status(@Param('id') id: string) {
    return this.repurpose.status(id);
  }
}
