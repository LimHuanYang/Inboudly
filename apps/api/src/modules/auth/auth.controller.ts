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
  async me(@CurrentUser() user: { supabaseUserId: string; email: string }) {
    const ctx = await this.auth.getCurrentUserContext(user.supabaseUserId);
    // Always return a JSON object — never a bare `null` — so the response
    // body is never empty (NestJS otherwise sends a 200 with 0-byte body,
    // which the web client can't `.json()`). When no Prisma User row
    // exists yet, fall back to the Supabase identity so the WorkspaceGuard
    // can prefill a sensible workspace name.
    if (!ctx) {
      return {
        id: null,
        supabaseUserId: user.supabaseUserId,
        email: user.email,
        fullName: null,
        memberships: [],
        needsProvisioning: true,
      };
    }
    return ctx;
  }
}
