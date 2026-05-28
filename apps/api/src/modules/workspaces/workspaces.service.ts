import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '@inboudly/database';

// Supported ISO 4217 currencies. Must stay in sync with the web app's
// lib/currencies.ts (the dropdown source). Validated here so a bad code
// can't be persisted.
const SUPPORTED_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
  'MYR', 'INR', 'IDR', 'THB', 'PHP', 'VND', 'KRW', 'TWD', 'NZD', 'SEK',
  'NOK', 'DKK', 'AED', 'SAR', 'BRL', 'MXN', 'ZAR',
]);

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

  /**
   * Update workspace-level settings. Currently just currency, but shaped to
   * grow (timezone, locale, etc.). Any member can change it — it's a display
   * preference, not a destructive op.
   */
  async updateSettings(
    workspaceId: string,
    supabaseUserId: string,
    settings: { currency?: string },
  ) {
    await this.assertMember(workspaceId, supabaseUserId);

    const data: { currency?: string } = {};
    if (settings.currency !== undefined) {
      const code = settings.currency.toUpperCase();
      if (!SUPPORTED_CURRENCIES.has(code)) {
        throw new BadRequestException(`Unsupported currency "${settings.currency}"`);
      }
      data.currency = code;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No settings to update');
    }

    return this.prisma.workspace.update({ where: { id: workspaceId }, data });
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
