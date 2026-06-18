import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostPublisherService } from './post-publisher.service';
import { PostScheduleCron } from './post-schedule.cron';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SocialAccountsModule } from '../social-accounts/social-accounts.module';

@Module({
  imports: [ConnectorsModule, SocialAccountsModule],
  controllers: [PostsController],
  providers: [PostsService, PostPublisherService, PostScheduleCron, WorkspacesService],
  exports: [PostsService, PostPublisherService],
})
export class PostsModule {}
