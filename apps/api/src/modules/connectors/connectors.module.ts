import { Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector-registry.service';
import { InstagramConnector } from './instagram/instagram.connector';
import { TikTokConnector } from './tiktok/tiktok.connector';
import { RedNoteConnector } from './rednote/rednote.connector';
import { YouTubeConnector } from './youtube/youtube.connector';
import { FacebookConnector } from './facebook/facebook.connector';
import { LinkedInConnector } from './linkedin/linkedin.connector';

@Module({
  providers: [InstagramConnector, TikTokConnector, RedNoteConnector, YouTubeConnector, FacebookConnector, LinkedInConnector, ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
