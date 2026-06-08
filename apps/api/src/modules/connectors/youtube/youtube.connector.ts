import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomBytes } from 'crypto';
import type { SocialAccount } from '@inboudly/database';
import type {
  IPlatformConnector,
  OauthAuthorizeUrl,
  OauthTokenSet,
  PostMetrics,
  PublishInput,
  PublishResult,
} from '../connector.interface';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

@Injectable()
export class YouTubeConnector implements IPlatformConnector {
  readonly platform = 'YOUTUBE' as const;
  private readonly logger = new Logger(YouTubeConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return { url: `${GOOGLE_AUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, _state: string, redirectUri: string): Promise<OauthTokenSet> {
    // Send credentials in the form-encoded body (not the query string) so the
    // client_secret can't surface in proxy/server access logs.
    const res = await axios.post(
      GOOGLE_TOKEN,
      new URLSearchParams({
        code,
        client_id: process.env.YOUTUBE_CLIENT_ID ?? '',
        client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
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
      platformUser: await this.fetchChannel(access_token),
    };
  }

  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const video = variant.media
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => m.mediaAsset)
      .find((m) => m.type === 'VIDEO');

    if (!video) {
      throw new BadRequestException(
        "YouTube requires a video — image-only posts can't be published to YouTube.",
      );
    }

    const snippet = {
      title: this.buildTitle(variant.caption),
      description: this.buildDescription(variant.caption, variant.hashtags),
      tags: this.cleanTags(variant.hashtags),
      categoryId: '22',
    };
    const status = { privacyStatus: this.resolvePrivacy(variant.platformOptions) };

    // 1. Download the video bytes
    const bytes = await axios.get(video.url, { responseType: 'arraybuffer' });
    const buf = Buffer.from(bytes.data as ArrayBuffer);

    // 2. Initiate resumable upload session
    const init = await axios.post(
      `${YT_UPLOAD}?uploadType=resumable&part=snippet,status`,
      { snippet, status },
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(buf.length),
        },
      },
    );

    const sessionUrl = init.headers['location'] as string | undefined;
    if (!sessionUrl) {
      throw new Error('YouTube did not return a resumable upload session URL');
    }

    // 3. Upload the bytes to the session URL
    const uploaded = await axios.put(sessionUrl, buf, {
      headers: {
        'Content-Type': 'video/*',
        'Content-Length': String(buf.length),
      },
    });

    const videoId = uploaded.data.id as string;
    this.logger.log(`Published YouTube video ${videoId}`);

    return {
      platformPostId: videoId,
      platformPostUrl: `https://youtu.be/${videoId}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<OauthTokenSet> {
    const res = await axios.post(
      GOOGLE_TOKEN,
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.YOUTUBE_CLIENT_ID ?? '',
        client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const { access_token, expires_in } = res.data as {
      access_token: string;
      expires_in: number;
    };
    return {
      accessToken: access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + expires_in * 1000),
      scopes: SCOPES,
      platformUser: await this.fetchChannel(access_token),
    };
  }

  async getPostMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics> {
    const res = await axios.get(`${YT_API}/videos`, {
      params: { part: 'statistics', id: platformPostId },
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    const item = res.data.items?.[0] as
      | { statistics: { viewCount?: string; likeCount?: string; commentCount?: string } }
      | undefined;
    if (!item) {
      throw new Error(`YouTube video not found: ${platformPostId}`);
    }
    const { viewCount, likeCount, commentCount } = item.statistics;
    return {
      videoViews: viewCount !== undefined ? Number(viewCount) : undefined,
      likes: likeCount !== undefined ? Number(likeCount) : undefined,
      comments: commentCount !== undefined ? Number(commentCount) : undefined,
      extra: { raw: item.statistics },
    };
  }

  private async fetchChannel(accessToken: string): Promise<OauthTokenSet['platformUser']> {
    const res = await axios.get(`${YT_API}/channels`, {
      params: { part: 'snippet', mine: 'true' },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ch = res.data.items?.[0] as
      | { id: string; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }
      | undefined;
    if (!ch) {
      throw new BadRequestException('No YouTube channel found for this Google account');
    }
    return {
      id: ch.id,
      handle: `@${ch.snippet.title}`,
      displayName: ch.snippet.title,
      avatarUrl: ch.snippet.thumbnails?.default?.url,
      extra: { channelId: ch.id },
    };
  }

  private buildTitle(caption: string): string {
    const firstLine = (caption ?? '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return (firstLine ?? 'Untitled').slice(0, 100);
  }

  private buildDescription(caption: string, hashtags: string[]): string {
    const tags = (hashtags ?? [])
      .map((h) => (h.startsWith('#') ? h : `#${h}`))
      .join(' ');
    return tags ? `${caption}\n\n${tags}` : caption;
  }

  private cleanTags(hashtags: string[]): string[] {
    return (hashtags ?? [])
      .map((h) => h.replace(/^#+/, '').trim())
      .filter((t) => t.length > 0);
  }

  private resolvePrivacy(opts: unknown): 'public' | 'unlisted' | 'private' {
    const p = (opts as { youtube?: { privacyStatus?: string } } | null | undefined)?.youtube
      ?.privacyStatus;
    return p === 'public' || p === 'private' ? p : 'unlisted';
  }
}
