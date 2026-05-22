import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AiCredentialsService, type AiProviderKeyName } from './ai-credentials.service';

const ALLOWED_KEY_FIELDS: AiProviderKeyName[] = [
  'geminiKey',
  'openaiKey',
  'anthropicKey',
  'runwayKey',
  'klingKey',
  'elevenLabsKey',
  'sunoKey',
  'pineconeKey',
];

@ApiTags('ai-credentials')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('workspaces/:workspaceId/ai-credentials')
export class AiCredentialsController {
  constructor(
    private credentials: AiCredentialsService,
    private workspaces: WorkspacesService,
  ) {}

  /** Safe view — never returns raw keys, only masked previews + config state. */
  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.credentials.view(workspaceId);
  }

  /** Save or overwrite a single provider's key. */
  @Put(':field')
  async upsert(
    @Param('workspaceId') workspaceId: string,
    @Param('field') field: string,
    @Body() body: { key: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    this.assertValidField(field);
    if (!body.key || body.key.trim().length < 10) {
      throw new BadRequestException('API key looks too short to be valid');
    }
    await this.credentials.upsertKey(workspaceId, field as AiProviderKeyName, body.key);
    return this.credentials.view(workspaceId);
  }

  @Delete(':field')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('field') field: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    this.assertValidField(field);
    await this.credentials.deleteKey(workspaceId, field as AiProviderKeyName);
    return this.credentials.view(workspaceId);
  }

  /** Set provider preference hints when multiple keys are configured. */
  @Patch('preferences')
  async setPreferences(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      preferredTextProvider?: 'claude' | 'gemini' | null;
      preferredImageProvider?: 'openai' | 'gemini' | null;
    },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    await this.credentials.setPreferences(workspaceId, body);
    return this.credentials.view(workspaceId);
  }

  private assertValidField(field: string): asserts field is AiProviderKeyName {
    if (!ALLOWED_KEY_FIELDS.includes(field as AiProviderKeyName)) {
      throw new BadRequestException(
        `Unknown key field "${field}". Allowed: ${ALLOWED_KEY_FIELDS.join(', ')}`,
      );
    }
  }
}
