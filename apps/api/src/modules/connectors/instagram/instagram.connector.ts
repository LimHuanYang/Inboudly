import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
const FB_OAUTH = 'https://www.facebook.com/v21.0/dialog/oauth';

/**
 * Instagram Graph API connector.
 *
 * Posting to Instagram requires:
 *   1. The user's IG account is a Business or Creator account
 *   2. Linked to a Facebook Page they admin
 *   3. The app has instagram_basic, instagram_content_publish, pages_read_engagement
 *      and pages_show_list scopes (App Review required for production)
 *
 * Publish flow (image/carousel/reel):
 *   POST /{ig-user-id}/media           → returns container_id
 *   POST /{ig-user-id}/media_publish   → returns IG media id
 * Carousels need an additional step where each child container is created
 * first, then the parent container references them.
 */
@Injectable()
export class InstagramConnector implements IPlatformConnector {
  readonly platform = 'INSTAGRAM' as const;
  private readonly logger = new Logger(InstagramConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID ?? '',
      redirect_uri: redirectUri,
      state,
      scope: [
        'instagram_basic',
        'instagram_content_publish',
        'pages_show_list',
        'pages_read_engagement',
        'business_management',
      ].join(','),
      response_type: 'code',
    });
    return { url: `${FB_OAUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, _state: string, redirectUri: string): Promise<OauthTokenSet> {
    // 1. Exchange code → short-lived token
    const tokenRes = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      },
    });
    const shortToken = tokenRes.data.access_token as string;

    // 2. Upgrade to long-lived (60-day) token
    const longRes = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.INSTAGRAM_APP_ID,
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });
    const longToken = longRes.data.access_token as string;
    const expiresIn = longRes.data.expires_in as number; // seconds

    // 3. Find the IG Business Account ID (via the user's pages)
    const pagesRes = await axios.get(`${GRAPH_BASE}/me/accounts`, {
      params: { access_token: longToken },
    });
    const page = pagesRes.data.data?.[0];
    if (!page) throw new BadRequestException('No Facebook Pages found for this user');

    const igRes = await axios.get(`${GRAPH_BASE}/${page.id}`, {
      params: {
        fields: 'instagram_business_account{id,username,name,profile_picture_url}',
        access_token: page.access_token,
      },
    });
    const igAccount = igRes.data.instagram_business_account;
    if (!igAccount) {
      throw new BadRequestException(
        'Selected Facebook Page is not linked to an Instagram Business account',
      );
    }

    return {
      accessToken: page.access_token, // page-scoped token; needed for IG publishing
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: ['instagram_basic', 'instagram_content_publish'],
      platformUser: {
        id: igAccount.id,
        handle: `@${igAccount.username}`,
        displayName: igAccount.name,
        avatarUrl: igAccount.profile_picture_url,
        extra: { pageId: page.id },
      },
    };
  }

  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const igUserId = account.platformUserId;
    const accessToken = account.accessToken;
    const caption = this.buildCaption(variant.caption, variant.hashtags);

    const media = variant.media.sort((a, b) => a.order - b.order).map((m) => m.mediaAsset);
    if (media.length === 0) throw new BadRequestException('Instagram requires at least one media asset');

    let containerId: string;

    if (media.length === 1) {
      // Single image or video
      const m = media[0]!;
      containerId = await this.createSingleContainer(igUserId, accessToken, m, caption);
    } else {
      // Carousel: create each child container, then a parent that references them
      const childIds: string[] = [];
      for (const m of media) {
        const id = await this.createSingleContainer(igUserId, accessToken, m, undefined, true);
        childIds.push(id);
      }
      const parent = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, null, {
        params: {
          media_type: 'CAROUSEL',
          children: childIds.join(','),
          caption,
          access_token: accessToken,
        },
      });
      containerId = parent.data.id;
    }

    // Publish the container
    const publishRes = await axios.post(`${GRAPH_BASE}/${igUserId}/media_publish`, null, {
      params: { creation_id: containerId, access_token: accessToken },
    });
    const platformPostId = publishRes.data.id as string;

    // Resolve permalink (best-effort)
    let permalink: string | undefined;
    try {
      const lookup = await axios.get(`${GRAPH_BASE}/${platformPostId}`, {
        params: { fields: 'permalink', access_token: accessToken },
      });
      permalink = lookup.data.permalink;
    } catch {
      this.logger.warn(`Could not fetch permalink for IG post ${platformPostId}`);
    }

    return { platformPostId, platformPostUrl: permalink };
  }

  private async createSingleContainer(
    igUserId: string,
    accessToken: string,
    media: { type: string; url: string },
    caption?: string,
    isCarouselItem = false,
  ): Promise<string> {
    const isVideo = media.type === 'VIDEO';
    const params: Record<string, string | undefined> = {
      access_token: accessToken,
      caption,
    };
    if (isVideo) {
      params.media_type = 'REELS'; // 2024+: feed videos go through Reels endpoint
      params.video_url = media.url;
    } else {
      params.image_url = media.url;
    }
    if (isCarouselItem) params.is_carousel_item = 'true';

    const res = await axios.post(`${GRAPH_BASE}/${igUserId}/media`, null, { params });
    const containerId = res.data.id as string;

    if (isVideo) {
      // Videos need processing time; poll status before publishing
      await this.waitForContainerReady(containerId, accessToken);
    }
    return containerId;
  }

  private async waitForContainerReady(containerId: string, accessToken: string) {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await axios.get(`${GRAPH_BASE}/${containerId}`, {
        params: { fields: 'status_code', access_token: accessToken },
      });
      if (res.data.status_code === 'FINISHED') return;
      if (res.data.status_code === 'ERROR') {
        throw new Error(`IG video container errored: ${containerId}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`IG video container did not finish in time: ${containerId}`);
  }

  private buildCaption(caption: string, hashtags: string[]): string {
    const tags = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  }
}
