import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlanTier, UserRole } from '@inboudly/database';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  /**
   * Called after Supabase signup webhook fires.
   * Creates the local User row, a Tenant, a default Workspace, and Owner membership.
   */
  async provisionNewUser(params: {
    supabaseUserId: string;
    email: string;
    fullName?: string;
    workspaceName: string;
  }) {
    const slugBase = params.workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: params.workspaceName,
          slug,
          plan: PlanTier.STARTER,
          billingEmail: params.email,
        },
      });

      const user = await tx.user.create({
        data: {
          email: params.email,
          fullName: params.fullName,
          supabaseUserId: params.supabaseUserId,
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          tenantId: tenant.id,
          name: 'Main Workspace',
          slug: 'main',
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: UserRole.OWNER,
          acceptedAt: new Date(),
        },
      });

      await tx.brandKit.create({
        data: {
          workspaceId: workspace.id,
          name: 'Default Brand Kit',
          isDefault: true,
        },
      });

      await tx.brandVoice.create({
        data: {
          workspaceId: workspace.id,
          name: 'Default Voice',
          embeddingNamespace: `voice-${workspace.id}-default`,
          isDefault: true,
        },
      });

      return { tenant, user, workspace };
    });
  }

  async getCurrentUserContext(supabaseUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { supabaseUserId },
      include: {
        memberships: {
          include: {
            workspace: { include: { tenant: true } },
          },
        },
      },
    });
    return user;
  }
}
