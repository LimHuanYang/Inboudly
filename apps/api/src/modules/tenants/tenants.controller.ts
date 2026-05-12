import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private tenants: TenantsService) {}

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tenants.getById(id);
  }

  @Patch(':id/branding')
  updateBranding(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.tenants.updateBranding(id, body);
  }
}
