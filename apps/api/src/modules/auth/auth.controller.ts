import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /**
   * Called by the web app right after Supabase signup completes.
   * Provisions tenant + workspace + user profile.
   */
  @Post('provision')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  async provision(
    @CurrentUser() user: { supabaseUserId: string; email: string },
    @Body() body: { fullName?: string; workspaceName: string },
  ) {
    return this.auth.provisionNewUser({
      supabaseUserId: user.supabaseUserId,
      email: user.email,
      fullName: body.fullName,
      workspaceName: body.workspaceName,
    });
  }

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: { supabaseUserId: string }) {
    return this.auth.getCurrentUserContext(user.supabaseUserId);
  }
}
