import { Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector-registry.service';
import { InstagramConnector } from './instagram/instagram.connector';
import { TikTokConnector } from './tiktok/tiktok.connector';
import { RedNoteConnector } from './rednote/rednote.connector';
import { YouTubeConnector } from './youtube/youtube.connector';

@Module({
  providers: [InstagramConnector, TikTokConnector, RedNoteConnector, YouTubeConnector, ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
