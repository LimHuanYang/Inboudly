import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import type {
  IPlatformConnector,
  OauthAuthorizeUrl,
  OauthTokenSet,
  PublishInput,
  PublishResult,
} from '../connector.interface';

const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo';
const LI_POSTS = 'https://api.linkedin.com/rest/posts';
const LI_VERSION = '202401';
const SCOPES = ['openid', 'profile', 'w_member_social'];

@Injectable()
export class LinkedInConnector implements IPlatformConnector {
  readonly platform = 'LINKEDIN' as const;
  private readonly logger = new Logger(LinkedInConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      state,
    });
    return { url: `${LI_AUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, _state: string, redirectUri: string): Promise<OauthTokenSet> {
    // Exchange code for tokens — credentials in form body, never query string
    const res = await axios.post(
      LI_TOKEN,
      new URLSearchParams({
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = res.data as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
      scopes: SCOPES,
      platformUser: await this.fetchUserInfo(access_token),
    };
  }

  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const caption = variant.caption ?? '';
    const tags = (variant.hashtags ?? [])
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    const commentary = tags ? `${caption}\n\n${tags}` : caption;

    const personUrn =
      (account.meta as Record<string, unknown> | null | undefined)?.personUrn ??
      `urn:li:person:${account.platformUserId}`;

    const body = {
      author: personUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const res = await axios.post(LI_POSTS, body, {
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'LinkedIn-Version': LI_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
    });

    // The created post URN is in x-restli-id header; fall back to body.id
    const urn: string =
      (res.headers['x-restli-id'] as string | undefined) ??
      (res.data as { id?: string } | undefined)?.id ??
      '';

    if (!urn) {
      throw new BadRequestException('LinkedIn did not return a post URN');
    }

    this.logger.log(`Published LinkedIn post ${urn}`);

    return {
      platformPostId: urn,
      platformPostUrl: `https://www.linkedin.com/feed/update/${urn}`,
    };
  }

  async refreshToken(token: string): Promise<OauthTokenSet> {
    const res = await axios.post(
      LI_TOKEN,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, expires_in } = res.data as {
      access_token: string;
      expires_in: number;
    };

    return {
      accessToken: access_token,
      refreshToken: token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
      scopes: SCOPES,
      platformUser: await this.fetchUserInfo(access_token),
    };
  }

  private async fetchUserInfo(accessToken: string): Promise<OauthTokenSet['platformUser']> {
    const res = await axios.get(LI_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { sub, name, picture } = res.data as {
      sub: string;
      name: string;
      picture?: string;
    };
    return {
      id: sub,
      handle: name,
      displayName: name,
      avatarUrl: picture,
      extra: { personUrn: `urn:li:person:${sub}` },
    };
  }
}
