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

/**
 * RedNote (小红书 / Xiaohongshu) connector.
 *
 * Xiaohongshu has no official public publishing API for foreign developers.
 * We integrate via the third-party API documented at xiaohongshu.apifox.cn,
 * which wraps the platform's mobile endpoints with auth + signing.
 *
 * The connector is deliberately small and isolated — when the third-party
 * provider changes their endpoint or signing scheme, only this file changes.
 *
 * Auth model: the third-party gives us a long-lived API key per workspace.
 * "OAuth" here is really "user pastes their key" — we still use the OAuth
 * shape so the connector contract is uniform.
 */
@Injectable()
export class RedNoteConnector implements IPlatformConnector {
  readonly platform = 'REDNOTE' as const;
  private readonly logger = new Logger(RedNoteConnector.name);
  private readonly apiBase = process.env.REDNOTE_API_BASE ?? 'https://api.xiaohongshu-3p.com';

  async startOauth(workspaceId: string, redirectUri: string): Promise<OauthAuthorizeUrl> {
    // For RedNote we redirect to our own "paste your key" page rather than
    // the platform's OAuth dialog (no public OAuth available).
    const state = `${workspaceId}.${randomBytes(16).toString('hex')}`;
    const params = new URLSearchParams({ state, redirect_uri: redirectUri });
    return {
      url: `${redirectUri.replace('/callback', '/manual')}?${params.toString()}`,
      state,
    };
  }

  async completeOauth(code: string, _state: string, _redirectUri: string): Promise<OauthTokenSet> {
    // `code` here is the API key the user pasted from the third-party provider.
    const apiKey = code;

    // Verify by hitting /me on the third-party API
    const userRes = await axios.get(`${this.apiBase}/v1/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const user = userRes.data?.data;
    if (!user?.user_id) {
      throw new BadRequestException('RedNote API key invalid — could not verify identity');
    }

    return {
      accessToken: apiKey,
      // RedNote third-party keys are typically long-lived (1 year+); no refresh
      platformUser: {
        id: user.user_id,
        handle: user.handle ?? user.nickname ?? `rn_${user.user_id}`,
        displayName: user.nickname,
        avatarUrl: user.avatar,
      },
    };
  }

  async publish({ account, variant }: PublishInput): Promise<PublishResult> {
    const apiKey = account.accessToken;
    const media = variant.media.sort((a, b) => a.order - b.order).map((m) => m.mediaAsset);
    if (media.length === 0) {
      throw new BadRequestException('RedNote requires at least one image or video');
    }

    const hasVideo = media.some((m) => m.type === 'VIDEO');
    const noteType = hasVideo ? 'video' : 'normal';

    // RedNote-specific: title is critical for search ranking. We pull the
    // first line of the caption as the title (Inboudly's RedNote algorithm
    // coach already nudges the user to put their main keyword in the first
    // 8 characters — see algorithm-coach.service.ts).
    const lines = variant.caption.split('\n');
    const title = (lines[0] ?? '').slice(0, 50) || 'Untitled';
    const body = lines.slice(1).join('\n').trim() || variant.caption;

    const topics = (variant.platformOptions as Record<string, string[]> | null)?.topics ?? [];

    const payload = {
      note_type: noteType,
      title,
      desc: body,
      hashtags: variant.hashtags.map((h) => (h.startsWith('#') ? h.slice(1) : h)),
      topics,
      images: media.filter((m) => m.type === 'IMAGE').map((m) => m.url),
      video_url: media.find((m) => m.type === 'VIDEO')?.url,
      cover_url: media[0]!.thumbnailUrl ?? media[0]!.url,
    };

    const res = await axios.post(`${this.apiBase}/v1/notes/publish`, payload, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });

    const noteId = res.data?.data?.note_id;
    const noteUrl = res.data?.data?.share_url;
    if (!noteId) {
      throw new Error(`RedNote publish failed: ${res.data?.message ?? 'unknown error'}`);
    }
    return { platformPostId: noteId, platformPostUrl: noteUrl };
  }
}
