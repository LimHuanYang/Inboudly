import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '@inboudly/database';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async listForUser(supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUserId },
      include: {
        memberships: {
          include: { workspace: { include: { tenant: true } } },
        },
      },
    });
    return user?.memberships.map((m) => ({ ...m.workspace, role: m.role })) ?? [];
  }

  async getById(workspaceId: string, supabaseUserId: string) {
    await this.assertMember(workspaceId, supabaseUserId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        tenant: true,
        members: { include: { user: true } },
        socialAccounts: true,
        brandKits: true,
        brandVoices: true,
      },
    });
    if (!workspace) throw new NotFoundException();
    return workspace;
  }

  async invite(workspaceId: string, supabaseUserId: string, email: string, role: UserRole) {
    await this.assertRole(workspaceId, supabaseUserId, [UserRole.OWNER, UserRole.ADMIN]);

    let user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) user = await this.prisma.user.create({ data: { email } });

    return this.prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: user.id } },
      update: { role },
      create: { workspaceId, userId: user.id, role },
    });
  }

  async assertMember(workspaceId: string, supabaseUserId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { supabaseUserId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this workspace');
    return member;
  }

  async assertRole(workspaceId: string, supabaseUserId: string, allowed: UserRole[]) {
    const member = await this.assertMember(workspaceId, supabaseUserId);
    if (!allowed.includes(member.role)) throw new ForbiddenException('Insufficient role');
    return member;
  }
}
