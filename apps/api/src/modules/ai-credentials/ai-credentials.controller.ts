import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  AiCredentialsService,
  type AiProviderKeyName,
  type AiProviderModelName,
} from './ai-credentials.service';
import { ProviderTestService } from './provider-test.service';

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

const ALLOWED_MODEL_FIELDS: AiProviderModelName[] = [
  'geminiModel',
  'geminiImageModel',
  'openaiModel',
  'anthropicModel',
  'pollinationsModel',
  'pollinationsVideoModel',
  'runwayModel',
  'klingModel',
  'veoVideoModel',
];

@ApiTags('ai-credentials')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('workspaces/:workspaceId/ai-credentials')
export class AiCredentialsController {
  constructor(
    private credentials: AiCredentialsService,
    private workspaces: WorkspacesService,
    private tester: ProviderTestService,
  ) {}

  @Get()
  async list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    return this.credentials.view(workspaceId);
  }

  @Put(':field')
  async upsert(
    @Param('workspaceId') workspaceId: string,
    @Param('field') field: string,
    @Body() body: { key: string; model?: string },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    this.assertValidKeyField(field);
    if (!body.key || body.key.trim().length < 10) {
      throw new BadRequestException('API key looks too short to be valid');
    }
    await this.credentials.upsertKey(workspaceId, field as AiProviderKeyName, body.key);
    // If the caller also passed a model override, save it in one round-trip.
    if (body.model !== undefined) {
      const modelField = field.replace('Key', 'Model') as AiProviderModelName;
      if (ALLOWED_MODEL_FIELDS.includes(modelField)) {
        await this.credentials.upsertModel(workspaceId, modelField, body.model);
      }
    }
    return this.credentials.view(workspaceId);
  }

  @Patch(':field/model')
  async setModel(
    @Param('workspaceId') workspaceId: string,
    @Param('field') field: string,
    @Body() body: { model: string | null },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    const modelField = field as AiProviderModelName;
    if (!ALLOWED_MODEL_FIELDS.includes(modelField)) {
      throw new BadRequestException(`Unknown model field "${field}"`);
    }
    await this.credentials.upsertModel(workspaceId, modelField, body.model);
    return this.credentials.view(workspaceId);
  }

  @Delete(':field')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('field') field: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    this.assertValidKeyField(field);
    await this.credentials.deleteKey(workspaceId, field as AiProviderKeyName);
    return this.credentials.view(workspaceId);
  }

  @Patch('preferences')
  async setPreferences(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      preferredTextProvider?: 'claude' | 'gemini' | null;
      preferredImageProvider?: 'openai' | 'gemini' | 'pollinations' | null;
      preferredVideoProvider?: 'demo' | 'pollinations' | 'runway' | 'kling' | 'veo' | null;
    },
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);
    await this.credentials.setPreferences(workspaceId, body);
    return this.credentials.view(workspaceId);
  }

  /**
   * Ping the provider's API with a tiny test prompt. Returns {ok, latencyMs,
   * modelUsed, message}. Used by the Settings UI's "Test" button.
   */
  @Post(':provider/test')
  async test(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @CurrentUser() user: { supabaseUserId: string },
  ) {
    await this.workspaces.assertMember(workspaceId, user.supabaseUserId);

    if (provider === 'gemini') {
      const key = await this.credentials.getDecryptedKey(workspaceId, 'geminiKey');
      if (!key) return { ok: false, message: 'No Gemini key saved.' };
      const model = await this.credentials.getModel(workspaceId, 'gemini');
      return this.tester.testGemini(key, model);
    }
    if (provider === 'anthropic') {
      const key = await this.credentials.getDecryptedKey(workspaceId, 'anthropicKey');
      if (!key) return { ok: false, message: 'No Anthropic key saved.' };
      const model = await this.credentials.getModel(workspaceId, 'anthropic');
      return this.tester.testAnthropic(key, model);
    }
    if (provider === 'openai') {
      const key = await this.credentials.getDecryptedKey(workspaceId, 'openaiKey');
      if (!key) return { ok: false, message: 'No OpenAI key saved.' };
      const model = await this.credentials.getModel(workspaceId, 'openai');
      return this.tester.testOpenAi(key, model);
    }
    throw new BadRequestException(`Test not supported for provider "${provider}"`);
  }

  private assertValidKeyField(field: string): asserts field is AiProviderKeyName {
    if (!ALLOWED_KEY_FIELDS.includes(field as AiProviderKeyName)) {
      throw new BadRequestException(
        `Unknown key field "${field}". Allowed: ${ALLOWED_KEY_FIELDS.join(', ')}`,
      );
    }
  }
}
