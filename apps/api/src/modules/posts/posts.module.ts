import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, WorkspacesService],
  exports: [PostsService],
})
export class PostsModule {}
