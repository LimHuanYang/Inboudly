import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountStatus, SocialPlatform } from '@inboudly/database';

@Injectable()
export class SocialAccountsService {
  constructor(private prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.socialAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Called by the OAuth callback handlers (one per platform) after
   * the platform redirects back with a code that we exchange for tokens.
   */
  async upsertFromOauth(params: {
    workspaceId: string;
    platform: SocialPlatform;
    platformUserId: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    scopes?: string[];
    meta?: Record<string, unknown>;
  }) {
    return this.prisma.socialAccount.upsert({
      where: {
        workspaceId_platform_platformUserId: {
          workspaceId: params.workspaceId,
          platform: params.platform,
          platformUserId: params.platformUserId,
        },
      },
      update: {
        handle: params.handle,
        displayName: params.displayName,
        avatarUrl: params.avatarUrl,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        tokenExpiresAt: params.tokenExpiresAt,
        scopes: params.scopes ?? [],
        meta: (params.meta ?? {}) as never,
        status: AccountStatus.ACTIVE,
      },
      create: {
        workspaceId: params.workspaceId,
        platform: params.platform,
        platformUserId: params.platformUserId,
        handle: params.handle,
        displayName: params.displayName,
        avatarUrl: params.avatarUrl,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        tokenExpiresAt: params.tokenExpiresAt,
        scopes: params.scopes ?? [],
        meta: (params.meta ?? {}) as never,
        status: AccountStatus.ACTIVE,
      },
    });
  }

  async disconnect(id: string) {
    return this.prisma.socialAccount.update({
      where: { id },
      data: { status: AccountStatus.DISCONNECTED },
    });
  }

  async updateTokens(
    id: string,
    tokens: { accessToken: string; tokenExpiresAt: Date | null; refreshToken?: string },
  ) {
    return this.prisma.socialAccount.update({
      where: { id },
      data: {
        accessToken: tokens.accessToken,
        tokenExpiresAt: tokens.tokenExpiresAt,
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
      },
    });
  }

  async markNeedsReconnect(id: string) {
    return this.prisma.socialAccount.update({
      where: { id },
      data: { status: AccountStatus.PENDING_REAUTH },
    });
  }
}
