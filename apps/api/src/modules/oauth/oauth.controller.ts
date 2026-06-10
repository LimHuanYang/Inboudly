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

    try {
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
    } catch (err) {
      res.status(200).send(this.popupErrorHtml(platform, (err as Error).message));
    }
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
  <p style="color:#666;margin:0">${this.escape(handle)}</p>
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

  /** HTML rendered in the popup when completeOauth (or upsert) throws.
   *  Posts an error message to the opener so Settings can toast it,
   *  and shows a human-friendly inline message + a Close button so the
   *  user can read it if the auto-close fails. Special-cases the common
   *  YouTube "no channel on this Google account" with a help link. */
  private popupErrorHtml(platform: SocialPlatform, rawMessage: string): string {
    const message = rawMessage || 'Connection failed.';
    const isNoYtChannel = platform === 'YOUTUBE' && /channel/i.test(message);
    const help = isNoYtChannel
      ? '<p style="color:#666;font-size:13px;margin:12px 0 0">Your Google account doesn\'t have a YouTube channel yet. <a href="https://www.youtube.com/account" target="_blank" style="color:#6366f1">Create one at youtube.com/account</a>, then try Connect again.</p>'
      : '';
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Connection failed</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;">
<div style="text-align:center;max-width:420px">
  <h2 style="color:#dc2626;margin:0 0 8px">Couldn't connect ${platform}</h2>
  <p style="color:#0a0a0a;margin:0">${this.escape(message)}</p>
  ${help}
  <button onclick="window.close()" style="margin-top:20px;padding:8px 16px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font:inherit">Close</button>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'inboudly:oauth:error', platform: '${platform}', message: ${JSON.stringify(message)} }, '*');
  }
</script>
</body></html>`;
  }

  private escape(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
    );
  }
}
