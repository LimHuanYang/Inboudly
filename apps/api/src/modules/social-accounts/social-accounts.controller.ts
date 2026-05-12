import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SocialAccountsService } from './social-accounts.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';

@ApiTags('social-accounts')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('social-accounts')
export class SocialAccountsController {
  constructor(private accounts: SocialAccountsService) {}

  @Get()
  list(@Query('workspaceId') workspaceId: string) {
    return this.accounts.list(workspaceId);
  }

  @Delete(':id')
  disconnect(@Param('id') id: string) {
    return this.accounts.disconnect(id);
  }
}
