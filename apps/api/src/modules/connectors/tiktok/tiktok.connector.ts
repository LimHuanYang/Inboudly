import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { randomBytes, createHash } from 'crypto';
import type {
  IPlatformConnector,
  OauthAuthorizeUrl,
  OauthTokenSet,
  PublishInput,
  PublishResult,
} from '../connector.interface';

const TT_OAUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const TT_API = 'https://open.tiktokapis.com/v2';

/**
 * TikTok Content Posting API connector.
 *
 * OAuth: TikTok for Developers, scopes:
 *   - user.info.basic           (identity)
 *   - video.publish             (direct post)
 *   - video.upload              (upload to inbox for user to finalise)
 *
 * Two posting modes:
 *   - "DIRECT_POST"  → publishes immediately if app passes audit
 *   - "UPLOAD_TO_INBOX" → goes to user's drafts; required during dev/audit
 *
 * Inboudly uses DIRECT_POST in production, falls back to UPLOAD_TO_INBOX
 * during development or if the workspace's app credentials are unaudited.
 */
@Injectable()
export class TikTokConnector implements IPlatformConnector {
  readonly platform = 'TIKTOK' as const;
  private readonly logger = new Logger(TikTokConnector.name);

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    // TikTok REQUIRES PKCE on every Login Kit auth (unlike most platforms where
    // it's optional). We generate a verifier, send its SHA-256 challenge in the
    // auth URL, and stash the verifier in `state` so completeOauth can recover
    // it (TikTok preserves `state` verbatim across the redirect).
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}.${codeVerifier}`;
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
      response_type: 'code',
      scope: 'user.info.basic,video.publish,video.upload',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return { url: `${TT_OAUTH}?${params.toString()}`, state };
  }

  async completeOauth(code: string, state: string, redirectUri: string): Promise<OauthTokenSet> {
    // Recover the PKCE verifier we stashed in `state` during startOauth.
    const codeVerifier = state.split('.')[2];
    if (!codeVerifier) throw new BadRequestException('Missing PKCE verifier in state');

    // 1. Token exchange
    const tokenRes = await axios.post(
      `${TT_API}/oauth/token/`,
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in, scope, open_id } = tokenRes.data;

    // 2. Fetch user info
    const userRes = await axios.get(`${TT_API}/user/info/`, {
      params: { fields: 'open_id,union_id,avatar_url,display_name,username' },
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const user = userRes.data.data?.user;

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + Number(expires_in) * 1000),
      scopes: typeof scope === 'string' ? scope.split(',') : [],
      platformUser: {
        id: open_id,
        handle: `@${user?.username ?? open_id}`,
        displayName: user?.display_name,
        avatarUrl: user?.avatar_url,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<OauthTokenSet> {
    const res = await axios.post(
      `${TT_API}/oauth/token/`,
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
      expiresAt: new Date(Date.now() + Number(res.data.expires_in) * 1000),
      platformUser: { id: res.data.open_id, handle: '' }, // unchanged
    };
  }

  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const accessToken = account.accessToken;
    const media = variant.media.sort((a, b) => a.order - b.order).map((m) => m.mediaAsset);
    const video = media.find((m) => m.type === 'VIDEO');
    if (!video) throw new BadRequestException('TikTok requires a video');

    const caption = this.buildCaption(variant.caption, variant.hashtags);
    const privacy = (variant.platformOptions as Record<string, string> | null)?.privacy ?? 'SELF_ONLY';

    // Step 1: initiate post — TikTok pulls the file from a public URL
    const initRes = await axios.post(
      `${TT_API}/post/publish/video/init/`,
      {
        post_info: {
          title: caption.slice(0, 150), // TikTok title limit
          privacy_level: privacy, // PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | SELF_ONLY
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: video.url,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const publishId = initRes.data.data?.publish_id as string;
    if (!publishId) throw new Error('TikTok did not return a publish_id');

    // Step 2: poll status until DONE
    const result = await this.pollPublishStatus(publishId, accessToken);
    return result;
  }

  private async pollPublishStatus(
    publishId: string,
    accessToken: string,
  ): Promise<PublishResult> {
    const maxAttempts = 60; // up to 5 min
    for (let i = 0; i < maxAttempts; i++) {
      const res = await axios.post(
        `${TT_API}/post/publish/status/fetch/`,
        { publish_id: publishId },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
      );
      const data = res.data.data;
      const status = data?.status;

      if (status === 'PUBLISH_COMPLETE' || status === 'SEND_TO_USER_INBOX') {
        const platformPostId = data.publicly_available_post_id?.[0] ?? publishId;
        return {
          platformPostId,
          platformPostUrl: platformPostId.startsWith('v')
            ? `https://www.tiktok.com/video/${platformPostId}`
            : undefined,
        };
      }
      if (status === 'FAILED') {
        throw new Error(`TikTok publish failed: ${data?.fail_reason ?? 'unknown'}`);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error('TikTok publish timed out');
  }

  private buildCaption(caption: string, hashtags: string[]): string {
    // TikTok hashtags are inline; we append them at the end
    const tags = hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ');
    return tags ? `${caption} ${tags}` : caption;
  }
}
