import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SocialPlatform } from '@inboudly/database';

const MAX_PER_WORKSPACE = 20;

@Injectable()
export class CompetitorsService {
  constructor(private prisma: PrismaService) {}

  /** Workspace's tracked competitors. Includes latest snapshot for headline stats. */
  async list(workspaceId: string) {
    return this.prisma.competitor.findMany({
      where: { workspaceId },
      include: {
        snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
      },
      orderBy: { trackedSince: 'desc' },
    });
  }

  async getById(id: string, workspaceId: string) {
    const c = await this.prisma.competitor.findUnique({
      where: { id },
      include: {
        snapshots: { orderBy: { capturedAt: 'desc' }, take: 30 },
      },
    });
    if (!c) throw new NotFoundException('Competitor not found');
    if (c.workspaceId !== workspaceId) throw new ForbiddenException();
    return c;
  }

  async add(workspaceId: string, input: {
    platform: SocialPlatform;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
    notes?: string;
  }) {
    const existing = await this.prisma.competitor.count({ where: { workspaceId } });
    if (existing >= MAX_PER_WORKSPACE) {
      throw new ForbiddenException(
        `Workspace limit: ${MAX_PER_WORKSPACE} competitors. Remove one before adding another.`,
      );
    }

    // Normalise handle (strip leading @, lowercase)
    const handle = input.handle.replace(/^@/, '').toLowerCase();

    return this.prisma.competitor.upsert({
      where: {
        workspaceId_platform_handle: { workspaceId, platform: input.platform, handle },
      },
      update: {
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        notes: input.notes,
      },
      create: {
        workspaceId,
        platform: input.platform,
        handle,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        notes: input.notes,
      },
    });
  }

  async remove(id: string, workspaceId: string) {
    const c = await this.prisma.competitor.findUnique({ where: { id } });
    if (!c) throw new NotFoundException();
    if (c.workspaceId !== workspaceId) throw new ForbiddenException();
    await this.prisma.competitor.delete({ where: { id } });
    return { ok: true };
  }

  async updateNotes(id: string, workspaceId: string, notes: string | null) {
    await this.getById(id, workspaceId); // asserts ownership
    return this.prisma.competitor.update({ where: { id }, data: { notes } });
  }
}
