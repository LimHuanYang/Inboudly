import { Injectable, NotFoundException } from '@nestjs/common';
import type { SocialPlatform } from '@inboudly/database';
import type { IPlatformConnector } from './connector.interface';
import { InstagramConnector } from './instagram/instagram.connector';
import { TikTokConnector } from './tiktok/tiktok.connector';
import { RedNoteConnector } from './rednote/rednote.connector';
import { YouTubeConnector } from './youtube/youtube.connector';
import { FacebookConnector } from './facebook/facebook.connector';
import { LinkedInConnector } from './linkedin/linkedin.connector';

/**
 * Single source of truth that maps each SocialPlatform to its connector.
 * Adding a new platform = build the connector + register it here.
 */
@Injectable()
export class ConnectorRegistry {
  private readonly connectors: Map<SocialPlatform, IPlatformConnector>;

  constructor(
    instagram: InstagramConnector,
    tiktok: TikTokConnector,
    rednote: RedNoteConnector,
    youtube: YouTubeConnector,
    private facebook: FacebookConnector,
    private linkedin: LinkedInConnector,
  ) {
    this.connectors = new Map<SocialPlatform, IPlatformConnector>([
      ['INSTAGRAM', instagram],
      ['TIKTOK', tiktok],
      ['REDNOTE', rednote],
      ['YOUTUBE', youtube],
      ['FACEBOOK', facebook],
      ['LINKEDIN', linkedin],
    ]);
  }

  get(platform: SocialPlatform): IPlatformConnector {
    const c = this.connectors.get(platform);
    if (!c) throw new NotFoundException(`No connector registered for ${platform}`);
    return c;
  }

  has(platform: SocialPlatform): boolean {
    return this.connectors.has(platform);
  }

  list(): SocialPlatform[] {
    return Array.from(this.connectors.keys());
  }
}
