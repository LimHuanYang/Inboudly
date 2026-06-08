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

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_OAUTH = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

@Injectable()
export class FacebookConnector implements IPlatformConnector {
  readonly platform = 'FACEBOOK' as const;
  private readonly logger = new Logger(FacebookConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID ?? '',
      redirect_uri: redirectUri,
      state,
      scope: 'pages_show_list,pages_manage_posts,pages_read_engagement',
      response_type: 'code',
    });
    return { url: `${FB_OAUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, _state: string, redirectUri: string): Promise<OauthTokenSet> {
    // 1. Exchange code → short-lived token
    const tokenRes = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      },
    });
    const shortToken = tokenRes.data.access_token as string;

    // 2. Upgrade to long-lived (60-day) token via fb_exchange_token
    const longRes = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });
    const longToken = longRes.data.access_token as string;
    const expiresIn = longRes.data.expires_in as number; // seconds

    // 3. Find the first managed Facebook Page
    const pagesRes = await axios.get(`${GRAPH_BASE}/me/accounts`, {
      params: { access_token: longToken },
    });
    const page = pagesRes.data.data?.[0];
    if (!page) {
      throw new BadRequestException(
        'No Facebook Page found — the connected account must manage a Page.',
      );
    }

    // Use the page-scoped access token for all publishing
    const pageToken = page.access_token as string;
    const pageId = page.id as string;

    return {
      accessToken: pageToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
      platformUser: {
        id: pageId,
        handle: page.name as string,
        displayName: page.name as string,
        extra: { pageId },
      },
    };
  }

  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const pageId = account.platformUserId;
    const accessToken = account.accessToken;
    const caption = this.buildCaption(variant.caption, variant.hashtags);

    const media = variant.media
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => m.mediaAsset);

    let platformPostId: string;

    if (media.length === 0) {
      // Text-only post → /feed
      const res = await axios.post(`${GRAPH_BASE}/${pageId}/feed`, null, {
        params: { message: caption, access_token: accessToken },
      });
      platformPostId = res.data.id as string;
    } else {
      const first = media[0]!;

      if (first.type === 'VIDEO') {
        // Video post → /videos
        const res = await axios.post(`${GRAPH_BASE}/${pageId}/videos`, null, {
          params: {
            file_url: first.url,
            description: caption,
            access_token: accessToken,
          },
        });
        platformPostId = res.data.id as string;
      } else {
        // IMAGE (or unknown) → /photos
        const res = await axios.post(`${GRAPH_BASE}/${pageId}/photos`, null, {
          params: {
            url: first.url,
            caption,
            access_token: accessToken,
          },
        });
        platformPostId = res.data.id as string;
      }
    }

    this.logger.log(`Published Facebook post ${platformPostId} on page ${pageId}`);

    return {
      platformPostId,
      platformPostUrl: `https://facebook.com/${platformPostId}`,
    };
  }

  async refreshToken(token: string): Promise<OauthTokenSet> {
    // Extend the long-lived page token via fb_exchange_token
    const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: token,
      },
    });
    const newToken = res.data.access_token as string;
    const expiresIn = res.data.expires_in as number;

    // Re-fetch page identity to keep platformUser up to date
    const pagesRes = await axios.get(`${GRAPH_BASE}/me/accounts`, {
      params: { access_token: newToken },
    });
    const page = pagesRes.data.data?.[0];

    return {
      accessToken: newToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'],
      platformUser: page
        ? {
            id: page.id as string,
            handle: page.name as string,
            displayName: page.name as string,
            extra: { pageId: page.id as string },
          }
        : { id: '', handle: '', displayName: '' },
    };
  }

  private buildCaption(caption: string, hashtags: string[]): string {
    const tags = (hashtags ?? [])
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  }
}
