import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import { SocialAccountsService } from '../social-accounts/social-accounts.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { SocialPlatform } from '@inboudly/database';

const PLATFORM_FROM_PARAM: Record<string, SocialPlatform> = {
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  rednote: 'REDNOTE',
  youtube: 'YOUTUBE',
  facebook: 'FACEBOOK',
  linkedin: 'LINKEDIN',
  pinterest: 'PINTEREST',
};

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private registry: ConnectorRegistry,
    private accounts: SocialAccountsService,
  ) {}

  /**
   * Step 1 — start: returns the authorize URL for the requested platform.
   * The client opens this URL in a popup or redirect; the user authenticates
   * with the platform and is redirected to /oauth/:platform/callback.
   *
   * The `state` param encodes both workspaceId and a CSRF token. We verify
   * it on the callback to make sure no one is hijacking the flow.
   */
  @Get(':platform/start')
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  async start(
    @Param('platform') platformParam: string,
    @Query('workspaceId') workspaceId: string,
    @CurrentUser() _user: { supabaseUserId: string },
  ) {
    const platform = PLATFORM_FROM_PARAM[platformParam.toLowerCase()];
    if (!platform) throw new BadRequestException(`Unknown platform: ${platformParam}`);
    if (!workspaceId) throw new BadRequestException('workspaceId is required');

    const connector = this.registry.get(platform);
    const redirectUri = this.redirectUriFor(platformParam);
    return connector.startOauth(workspaceId, redirectUri);
  }

  /**
   * Step 2 — callback: the platform redirects here with `code` and `state`.
   * We exchange the code for tokens, look up the platform user, and upsert
   * the SocialAccount in our database.
   *
   * No auth guard here — the user has just been bounced through the platform's
   * OAuth flow, they're not necessarily logged into Inboudly in this tab. We
   * trust the `state` we issued (which contains the workspaceId) and respond
   * with an HTML page that closes the popup and notifies the parent window.
   */
  @Get(':platform/callback')
  async callback(
    @Param('platform') platformParam: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const platform = PLATFORM_FROM_PARAM[platformParam.toLowerCase()];
    if (!platform) throw new BadRequestException(`Unknown platform: ${platformParam}`);
    if (!code || !state) throw new BadRequestException('Missing code or state');

    const workspaceId = state.split('.')[0];
    if (!workspaceId) throw new BadRequestException('Invalid state');

    const connector = this.registry.get(platform);
    const redirectUri = this.redirectUriFor(platformParam);
    const tokens = await connector.completeOauth(code, state, redirectUri);

    await this.accounts.upsertFromOauth({
      workspaceId,
      platform,
      platformUserId: tokens.platformUser.id,
      handle: tokens.platformUser.handle,
      displayName: tokens.platformUser.displayName,
      avatarUrl: tokens.platformUser.avatarUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      meta: tokens.platformUser.extra,
    });

    res.send(this.popupResponseHtml(platform, tokens.platformUser.handle));
  }

  private redirectUriFor(platform: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    return `${base}/api/v1/oauth/${platform.toLowerCase()}/callback`;
  }

  private popupResponseHtml(platform: SocialPlatform, handle: string): string {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Connected</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;">
  <h2 style="color:#0a0a0a;margin:0 0 8px">${platform} connected</h2>
  <p style="color:#666;margin:0">${handle}</p>
  <p style="color:#999;font-size:12px;margin-top:24px">You can close this window.</p>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'inboudly:oauth:success', platform: '${platform}' }, '*');
    setTimeout(() => window.close(), 1500);
  }
</script>
</body></html>`;
  }
}
