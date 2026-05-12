import { Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector-registry.service';
import { InstagramConnector } from './instagram/instagram.connector';
import { TikTokConnector } from './tiktok/tiktok.connector';
import { RedNoteConnector } from './rednote/rednote.connector';

@Module({
  providers: [InstagramConnector, TikTokConnector, RedNoteConnector, ConnectorRegistry],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
