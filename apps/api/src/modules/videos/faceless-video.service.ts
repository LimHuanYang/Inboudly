import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AiCredentialsService } from '../ai-credentials/ai-credentials.service';
import { R2StorageService } from '../media/r2-storage.service';
import {
  FACELESS_NICHES, findNiche, voiceForNiche, type FacelessNiche,
} from './faceless-niches';
import type { VideoProject, VideoScene } from '@inboudly/database';

interface AiScene {
  text: string;
  visualPrompt: string;
  durationSec: number;
}

interface AiScriptResponse {
  title: string;
  scenes: AiScene[];
}

interface CreateProjectArgs {
  workspaceId: string;
  niche: string;
  topic: string;
  trendId?: string | null;
}

/**
 * Faceless Video Engine v1 — generates a structured, scene-by-scene script
 * for short-form faceless content (motivational, fitness, history, etc.).
 *
 * v1 ships SCRIPT generation only (the highest-value, lowest-risk piece).
 * v2 will layer in:
 *   - ElevenLabs voiceover per scene (BYOK)
 *   - Runway/Kling video clip per scene (BYOK)
 *   - Pexels/Pixabay stock footage fallback
 *   - ffmpeg stitching into final MP4
 *   - Bull queue with live progress updates
 *
 * Each preset niche shapes the prompt (hook style, scene count, voice tone,
 * visual style hints) so output feels native to the niche. Adding a niche
 * is one-line in faceless-niches.ts — no service code changes needed.
 */
@Injectable()
export class FacelessVideoService {
  private readonly logger = new Logger(FacelessVideoService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: AiCredentialsService,
    private r2: R2StorageService,
    @InjectQueue('video-export') private exportQueue: Queue,
  ) {}

  listNiches(): FacelessNiche[] {
    return FACELESS_NICHES;
  }

  async list(workspaceId: string): Promise<Array<VideoProject & { sceneCount: number }>> {
    const projects = await this.prisma.videoProject.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { scenes: true } } },
    });
    return projects.map(({ _count, ...p }) => ({ ...p, sceneCount: _count.scenes }));
  }

  async getProject(
    id: string,
    workspaceId: string,
  ): Promise<VideoProject & { scenes: VideoScene[]; nichePreset: FacelessNiche | null }> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id, workspaceId },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return { ...project, nichePreset: findNiche(project.niche) ?? null };
  }

  /**
   * Creates the project + immediately tries to generate the script. The
   * script status starts PENDING → GENERATING → READY (or FAILED). The web
   * client polls the project endpoint to see status changes.
   */
  async createProject(args: CreateProjectArgs): Promise<VideoProject> {
    const niche = findNiche(args.niche);
    if (!niche) throw new BadRequestException(`Unknown niche slug "${args.niche}"`);
    if (!args.topic.trim()) throw new BadRequestException('Topic is required');

    const project = await this.prisma.videoProject.create({
      data: {
        workspaceId: args.workspaceId,
        niche: niche.slug,
        topic: args.topic.trim(),
        trendId: args.trendId ?? null,
        scriptStatus: 'PENDING',
      },
    });

    // Run generation in-band for v1 — fast enough for short scripts. v2 will
    // move this to a Bull job to keep the API responsive under load.
    await this.generateScript(project.id, args.workspaceId);

    return this.prisma.videoProject.findUniqueOrThrow({ where: { id: project.id } });
  }

  /**
   * Generate (or re-generate) the script for a project. Marks status
   * GENERATING during the AI call, then READY + populates scenes on success
   * or FAILED + errorMessage on error. Existing scenes are wiped on regen.
   */
  async generateScript(projectId: string, workspaceId: string): Promise<void> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const niche = findNiche(project.niche);
    if (!niche) {
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          scriptStatus: 'FAILED',
          errorMessage: `Unknown niche "${project.niche}" — preset removed?`,
        },
      });
      return;
    }

    const resolved = await this.credentials.resolveTextProvider(workspaceId);
    if (!resolved) {
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          scriptStatus: 'FAILED',
          errorMessage:
            'No text AI provider configured. Add an Anthropic or Google key in Settings → AI Providers.',
        },
      });
      return;
    }

    await this.prisma.videoProject.update({
      where: { id: projectId },
      data: { scriptStatus: 'GENERATING', errorMessage: null },
    });

    const prompt = this.buildScriptPrompt(niche, project.topic);

    let raw: string;
    let modelUsed: string;
    try {
      if (resolved.provider === 'claude') {
        const client = new Anthropic({ apiKey: resolved.apiKey });
        const res = await client.messages.create({
          model: resolved.model,
          max_tokens: 2048,
          temperature: 0.8,
          messages: [{ role: 'user', content: prompt }],
        });
        const block = res.content.find((c) => c.type === 'text');
        raw = block?.type === 'text' ? block.text : '';
        modelUsed = res.model;
      } else {
        const client = new GoogleGenerativeAI(resolved.apiKey);
        const model = client.getGenerativeModel({
          model: resolved.model,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8,
            maxOutputTokens: 2048,
          },
        });
        const res = await model.generateContent(prompt);
        raw = res.response.text();
        modelUsed = resolved.model;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Script generation failed (${resolved.provider}): ${msg}`);
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          scriptStatus: 'FAILED',
          errorMessage: `${resolved.provider === 'claude' ? 'Claude' : 'Gemini'} request failed: ${msg}`,
          modelUsed: resolved.model,
        },
      });
      return;
    }

    const parsed = this.parseScript(raw);
    if (!parsed || !parsed.scenes.length) {
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          scriptStatus: 'FAILED',
          errorMessage: 'AI returned an unparseable response. Try again or switch provider.',
          modelUsed,
        },
      });
      return;
    }

    // Wipe + recreate scenes in a transaction so we never end up with
    // a half-written script if scene creation fails midway.
    const totalDuration = parsed.scenes.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
    await this.prisma.$transaction([
      this.prisma.videoScene.deleteMany({ where: { projectId } }),
      ...parsed.scenes.map((s, i) =>
        this.prisma.videoScene.create({
          data: {
            projectId,
            order: i,
            text: s.text.slice(0, 2000),
            visualPrompt: s.visualPrompt.slice(0, 500),
            durationSec: Math.max(2, Math.min(15, s.durationSec ?? 5)),
          },
        }),
      ),
      this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          scriptStatus: 'READY',
          title: parsed.title?.slice(0, 200) ?? project.topic.slice(0, 200),
          durationSec: totalDuration,
          modelUsed,
          errorMessage: null,
        },
      }),
    ]);
  }

  async updateScene(
    sceneId: string,
    workspaceId: string,
    update: { text?: string; visualPrompt?: string; durationSec?: number },
  ): Promise<VideoScene> {
    // Verify the scene belongs to a project in this workspace
    const scene = await this.prisma.videoScene.findUnique({
      where: { id: sceneId },
      include: { project: { select: { workspaceId: true } } },
    });
    if (!scene || scene.project.workspaceId !== workspaceId) {
      throw new NotFoundException('Scene not found');
    }
    return this.prisma.videoScene.update({
      where: { id: sceneId },
      data: {
        ...(update.text !== undefined && { text: update.text.slice(0, 2000) }),
        ...(update.visualPrompt !== undefined && { visualPrompt: update.visualPrompt.slice(0, 500) }),
        ...(update.durationSec !== undefined && {
          durationSec: Math.max(2, Math.min(15, update.durationSec)),
        }),
      },
    });
  }

  async deleteProject(id: string, workspaceId: string): Promise<void> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    await this.prisma.videoProject.delete({ where: { id } });
  }

  /**
   * Enqueue a video-export job for the given project. Sets exportStatus to
   * GENERATING immediately so the client can begin polling. Throws
   * BadRequestException if no scenes have a videoUrl yet.
   */
  async exportProject(projectId: string): Promise<VideoProject> {
    const project = await this.prisma.videoProject.findUniqueOrThrow({
      where: { id: projectId },
      include: { scenes: { where: { videoUrl: { not: null } } } },
    });

    if (project.scenes.length === 0) {
      throw new BadRequestException('No scene videos to export');
    }

    const updated = await this.prisma.videoProject.update({
      where: { id: projectId },
      data: { exportStatus: 'GENERATING', errorMessage: null },
    });

    await this.exportQueue.add('video-export', { projectId }, {
      attempts: 2,
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    });

    return updated;
  }

  // ----------------------------------------------------------------

  private buildScriptPrompt(niche: FacelessNiche, topic: string): string {
    return `You are a faceless video scriptwriter producing short-form vertical content.

NICHE: ${niche.label}
NICHE DESCRIPTION: ${niche.description}
HOOK STYLE: ${niche.hookStyle}
TARGET SCENES: ${niche.targetScenes} (60-second video, so ~${Math.round(60 / niche.targetScenes)} sec each)
VOICE TONE: ${niche.voiceTone}
VISUAL STYLE: ${niche.visualStyle}

TOPIC: ${topic}

Write a tight, scene-by-scene script. Each scene is ONE spoken line (no stage directions in the spoken text — those go in visualPrompt). The opening scene must HOOK in the first 3 seconds. Build tension or curiosity, deliver the payoff in the final 1-2 scenes.

Each scene needs:
- text:         the EXACT words spoken (1-3 sentences, conversational, ~10-25 words)
- visualPrompt: detailed shot description for video generation — what's on screen,
                camera angle, mood, motion (1-2 sentences)
- durationSec:  estimated seconds for this scene (3-10 typical)

Return STRICT JSON only — no prose, no markdown fences:

{
  "title": "punchy YouTube/TikTok title (max 60 chars)",
  "scenes": [
    {
      "text": "...",
      "visualPrompt": "...",
      "durationSec": 5
    }
  ]
}

CRITICAL:
- Scene COUNT must be ${niche.targetScenes} (±1 acceptable).
- "text" is spoken aloud — write conversationally, not as prose. No "[pause]" or stage directions.
- Match the niche's voice tone (${niche.voiceTone}) — if "dramatic", be dramatic; if "calm", be measured.
- visualPrompt must be SPECIFIC enough for an AI video gen model to use as a prompt.`;
  }

  // ================================================================
  // VOICE GENERATION (v2 slice — ElevenLabs)
  // ================================================================

  /**
   * Generate voiceover for EVERY scene in a project. Sequential to respect
   * ElevenLabs rate limits; ~5-10 sec per scene. Stores each MP3 in R2
   * under videos/{projectId}/scene-{order}.mp3 and writes the public URL
   * back to the scene.
   *
   * Idempotent per scene: re-running overwrites the previous MP3 at the
   * same R2 key (deterministic path = no orphan files).
   */
  async generateVoiceAll(projectId: string, workspaceId: string): Promise<void> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: projectId, workspaceId },
      include: { scenes: { orderBy: { order: 'asc' } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (project.scriptStatus !== 'READY') {
      throw new BadRequestException('Script must be READY before generating voice');
    }
    if (!project.scenes.length) throw new BadRequestException('Project has no scenes');

    const apiKey = await this.credentials.getDecryptedKey(workspaceId, 'elevenLabsKey');
    if (!apiKey) {
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          voiceStatus: 'FAILED',
          errorMessage:
            'Voice generation needs an ElevenLabs API key. Add one in Settings → AI Providers.',
        },
      });
      return;
    }

    await this.prisma.videoProject.update({
      where: { id: projectId },
      data: { voiceStatus: 'GENERATING', errorMessage: null },
    });

    const voice = voiceForNiche(project.niche);
    let failed = 0;
    for (const scene of project.scenes) {
      try {
        const url = await this.synthesizeToR2(apiKey, voice.voiceId, scene.text, projectId, scene.order);
        await this.prisma.videoScene.update({
          where: { id: scene.id },
          data: { voiceUrl: url },
        });
      } catch (err) {
        failed++;
        this.logger.error(`Voice gen failed for scene ${scene.order}: ${err instanceof Error ? err.message : err}`);
      }
    }

    await this.prisma.videoProject.update({
      where: { id: projectId },
      data: {
        voiceStatus: failed === project.scenes.length ? 'FAILED' : 'READY',
        errorMessage:
          failed === 0
            ? null
            : failed === project.scenes.length
              ? 'All scenes failed. Check your ElevenLabs key + quota.'
              : `${failed} of ${project.scenes.length} scenes failed. Re-run to retry.`,
      },
    });
  }

  /**
   * Regenerate voice for a single scene (after editing the script text).
   * Lighter than full project regen — handy when the user tweaks one line.
   */
  async generateSceneVoice(sceneId: string, workspaceId: string): Promise<VideoScene> {
    const scene = await this.prisma.videoScene.findUnique({
      where: { id: sceneId },
      include: { project: { select: { workspaceId: true, niche: true, id: true } } },
    });
    if (!scene || scene.project.workspaceId !== workspaceId) {
      throw new NotFoundException('Scene not found');
    }

    const apiKey = await this.credentials.getDecryptedKey(workspaceId, 'elevenLabsKey');
    if (!apiKey) {
      throw new BadRequestException(
        'Voice generation needs an ElevenLabs API key. Add one in Settings → AI Providers.',
      );
    }

    const voice = voiceForNiche(scene.project.niche);
    const url = await this.synthesizeToR2(
      apiKey, voice.voiceId, scene.text, scene.project.id, scene.order,
    );
    return this.prisma.videoScene.update({
      where: { id: sceneId },
      data: { voiceUrl: url },
    });
  }

  /**
   * Calls ElevenLabs text-to-speech, uploads the returned MP3 to R2, and
   * returns the public URL. Throws on any failure (caller decides how to
   * recover — mark scene failed, mark project failed, etc.).
   */
  private async synthesizeToR2(
    apiKey: string,
    voiceId: string,
    text: string,
    projectId: string,
    sceneOrder: number,
  ): Promise<string> {
    // ElevenLabs v1 text-to-speech endpoint. Returns binary MP3.
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0.4,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // Deterministic R2 key — re-runs overwrite, no orphans.
    const key = `videos/${projectId}/scene-${sceneOrder}.mp3`;
    return this.r2.putObject(key, buf, 'audio/mpeg');
  }

  // ================================================================

  private parseScript(raw: string): AiScriptResponse | null {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      if (
        Array.isArray(parsed?.scenes) &&
        parsed.scenes.length > 0 &&
        parsed.scenes.every(
          (s: AiScene) =>
            typeof s?.text === 'string' &&
            s.text.trim().length > 0 &&
            typeof s?.visualPrompt === 'string',
        )
      ) {
        return parsed as AiScriptResponse;
      }
      return null;
    } catch {
      return null;
    }
  }
}
