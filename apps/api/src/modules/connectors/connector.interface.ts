import type { SocialPlatform, MediaAsset, PostVariant, SocialAccount } from '@inboudly/database';

export interface OauthAuthorizeUrl {
  url: string;
  state: string;
}

export interface OauthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  platformUser: {
    id: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
    extra?: Record<string, unknown>;
  };
}

export interface PublishInput {
  account: SocialAccount;
  variant: PostVariant & { media: Array<{ mediaAsset: MediaAsset; order: number }> };
}

export interface PublishResult {
  platformPostId: string;
  platformPostUrl?: string;
}

export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  impressions?: number;
  videoViews?: number;
  extra?: Record<string, unknown>;
}

/**
 * Every platform we support implements this interface. The connector registry
 * (see connector-registry.service.ts) maps each SocialPlatform to its
 * connector instance, so the rest of the system can publish without knowing
 * platform-specific details.
 *
 * `refreshToken` is optional because not every platform supports refresh
 * tokens (e.g. Instagram long-lived tokens are refreshed via a different
 * endpoint than OAuth refresh).
 */
export interface IPlatformConnector {
  readonly platform: SocialPlatform;

  /** Build the URL the user is redirected to in order to grant access. */
  startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl>;

  /** Exchange the code returned by the platform for tokens + user identity. */
  completeOauth(code: string, state: string, redirectUri: string): Promise<OauthTokenSet>;

  /** Publish a single post variant. Throws on failure (caller logs + retries). */
  publish(input: PublishInput): Promise<PublishResult>;

  /** Optional: refresh expired access tokens. */
  refreshToken?(refreshToken: string): Promise<OauthTokenSet>;

  /** Optional: fetch engagement metrics for a previously published post. */
  getPostMetrics?(account: SocialAccount, platformPostId: string): Promise<PostMetrics>;
}
