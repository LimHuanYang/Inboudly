import { Injectable, NotFoundException } from '@nestjs/common';
import type { SocialPlatform } from '@inboudly/database';
import type { IPlatformConnector } from './connector.interface';
import { InstagramConnector } from './instagram/instagram.connector';
import { TikTokConnector } from './tiktok/tiktok.connector';
import { RedNoteConnector } from './rednote/rednote.connector';

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
  ) {
    this.connectors = new Map<SocialPlatform, IPlatformConnector>([
      ['INSTAGRAM', instagram],
      ['TIKTOK', tiktok],
      ['REDNOTE', rednote],
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
