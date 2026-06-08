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

const PINTEREST_OAUTH = 'https://www.pinterest.com/oauth/';
const PINTEREST_TOKEN = 'https://api.pinterest.com/v5/oauth/token';
const PINTEREST_USER = 'https://api.pinterest.com/v5/user_account';
const PINTEREST_BOARDS = 'https://api.pinterest.com/v5/boards';
const PINTEREST_PINS = 'https://api.pinterest.com/v5/pins';

const SCOPES = ['boards:read', 'pins:read', 'pins:write'];

@Injectable()
export class PinterestConnector implements IPlatformConnector {
  readonly platform = 'PINTEREST' as const;
  private readonly logger = new Logger(PinterestConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: process.env.PINTEREST_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    });
    return { url: `${PINTEREST_OAUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, _state: string, redirectUri: string): Promise<OauthTokenSet> {
    const clientId = process.env.PINTEREST_CLIENT_ID ?? '';
    const clientSecret = process.env.PINTEREST_CLIENT_SECRET ?? '';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Exchange code for tokens using HTTP Basic auth + form-encoded body
    const tokenRes = await axios.post(
      PINTEREST_TOKEN,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data as {
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
    const accessToken = account.accessToken;

    // Resolve board: prefer account.meta?.boardId, else use first board
    const boardId =
      (account.meta as Record<string, unknown> | null | undefined)?.boardId ??
      await this.resolveFirstBoard(accessToken);

    // Pick first IMAGE asset sorted by order
    const imageAsset = variant.media
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => m.mediaAsset)
      .find((a) => a.type === 'IMAGE');

    if (!imageAsset) {
      throw new BadRequestException('Pinterest requires an image to create a Pin.');
    }

    const caption = this.buildCaption(variant.caption, variant.hashtags);
    const title = caption.split('\n')[0]!.slice(0, 100);

    const res = await axios.post(
      PINTEREST_PINS,
      {
        board_id: boardId,
        title,
        description: caption,
        media_source: {
          source_type: 'image_url',
          url: imageAsset.url,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const pinId = res.data.id as string;
    this.logger.log(`Published Pinterest pin ${pinId} on board ${String(boardId)}`);

    return {
      platformPostId: pinId,
      platformPostUrl: `https://www.pinterest.com/pin/${pinId}`,
    };
  }

  async refreshToken(token: string): Promise<OauthTokenSet> {
    const clientId = process.env.PINTEREST_CLIENT_ID ?? '';
    const clientSecret = process.env.PINTEREST_CLIENT_SECRET ?? '';
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await axios.post(
      PINTEREST_TOKEN,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token,
      }),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
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

  private async resolveFirstBoard(accessToken: string): Promise<string> {
    const res = await axios.get(PINTEREST_BOARDS, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const boards = res.data.items as Array<{ id: string }> | undefined;
    const firstBoard = boards?.[0];
    if (!firstBoard) {
      throw new BadRequestException('No Pinterest boards found on this account.');
    }
    return firstBoard.id;
  }

  private async fetchUserInfo(accessToken: string): Promise<OauthTokenSet['platformUser']> {
    const res = await axios.get(PINTEREST_USER, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const { username } = res.data as { username: string };
    return {
      id: username,
      handle: username,
      displayName: username,
      extra: {},
    };
  }

  private buildCaption(caption: string, hashtags: string[]): string {
    const tags = (hashtags ?? [])
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  }
}
