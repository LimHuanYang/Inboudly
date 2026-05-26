import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentIntelligenceService } from './comment-intelligence.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsModule } from '../ai-credentials/ai-credentials.module';

@Module({
  imports: [AiCredentialsModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentIntelligenceService, WorkspacesService],
  exports: [CommentsService],
})
export class CommentsModule {}
