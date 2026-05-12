import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SocialAccountsModule } from '../social-accounts/social-accounts.module';
import { OAuthController } from './oauth.controller';

@Module({
  imports: [ConnectorsModule, SocialAccountsModule],
  controllers: [OAuthController],
})
export class OAuthModule {}
