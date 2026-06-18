import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import { SocialAccountsService } from '../social-accounts/social-accounts.service';

const SKEW_MS = 60_000;
export const MAX_RETRIES = 3;

@Injectable()
export class PostPublisherService {
  private readonly logger = new Logger(PostPublisherService.name);

  constructor(
    private prisma: PrismaService,
    private connectors: ConnectorRegistry,
    private accounts: SocialAccountsService,
  ) {}

  private async ensureUsableAccount(account: any, connector: { refreshToken?: (rt: string) => Promise<any> }) {
    const expired = account.tokenExpiresAt && new Date(account.tokenExpiresAt).getTime() < Date.now() + SKEW_MS;
    if (!expired || !connector.refreshToken || !account.refreshToken) return account;
    const fresh = await connector.refreshToken(account.refreshToken);
    return this.accounts.updateTokens(account.id, {
      accessToken: fresh.accessToken,
      tokenExpiresAt: fresh.expiresAt ?? null,
      refreshToken: fresh.refreshToken,
    });
  }

  private backoff(retryCount: number): Date {
    const mins = Math.min(2 ** retryCount * 5, 6 * 60);
    return new Date(Date.now() + mins * 60_000);
  }

  async publishPost(postId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        variants: { include: { media: { include: { mediaAsset: true } }, publications: true } },
        workspace: { include: { socialAccounts: true } },
      },
    });
    if (!post) { this.logger.warn(`Post ${postId} not found`); return; }

    await this.prisma.post.update({ where: { id: postId }, data: { status: PostStatus.PUBLISHING } });

    let succeeded = 0;
    const total = post.variants.length;

    for (const variant of post.variants) {
      const account = post.workspace.socialAccounts.find(
        (a: any) => a.platform === variant.platform && a.status === 'ACTIVE',
      );
      const already = (variant.publications ?? []).find(
        (p: any) => p.socialAccountId === account?.id && p.status === PublicationStatus.SUCCESS,
      );
      if (already) { succeeded++; continue; }
      if (!account) { this.logger.warn(`No active ${variant.platform} account for post ${postId}`); continue; }

      const missingMedia = (variant.media ?? []).some((m: any) => !m.mediaAsset || !m.mediaAsset.url);
      if (missingMedia) { await this.recordFailure(variant.id, account.id, 'Attached media is not ready yet.'); continue; }

      try {
        const connector = this.connectors.get(variant.platform);
        let usable = account;
        try { usable = await this.ensureUsableAccount(account, connector); }
        catch { await this.accounts.markNeedsReconnect(account.id); throw new Error(`${variant.platform} access expired — reconnect in Settings to publish.`); }
        const result = await connector.publish({ account: usable, variant: { ...variant, media: variant.media } });
        await this.prisma.postPublication.upsert({
          where: { postVariantId_socialAccountId: { postVariantId: variant.id, socialAccountId: account.id } },
          update: { status: PublicationStatus.SUCCESS, platformPostId: result.platformPostId, platformPostUrl: result.platformPostUrl, publishedAt: new Date(), errorMessage: null, nextRetryAt: null },
          create: { postVariantId: variant.id, socialAccountId: account.id, status: PublicationStatus.SUCCESS, platformPostId: result.platformPostId, platformPostUrl: result.platformPostUrl, publishedAt: new Date() },
        });
        succeeded++;
      } catch (err) {
        await this.recordFailure(variant.id, account.id, (err as Error).message);
      }
    }

    const status = succeeded === total ? PostStatus.PUBLISHED : succeeded > 0 ? PostStatus.PARTIALLY_PUBLISHED : PostStatus.FAILED;
    await this.prisma.post.update({
      where: { id: postId },
      data: { status, publishedAt: status === PostStatus.PUBLISHED ? new Date() : undefined },
    });
  }

  private async recordFailure(postVariantId: string, socialAccountId: string, message: string) {
    const existing = await this.prisma.postPublication.findUnique({
      where: { postVariantId_socialAccountId: { postVariantId, socialAccountId } },
    });
    const retryCount = (existing?.retryCount ?? 0) + 1;
    const nextRetryAt = retryCount <= MAX_RETRIES ? this.backoff(retryCount) : null;
    await this.prisma.postPublication.upsert({
      where: { postVariantId_socialAccountId: { postVariantId, socialAccountId } },
      update: { status: PublicationStatus.FAILED, errorMessage: message, retryCount, nextRetryAt },
      create: { postVariantId, socialAccountId, status: PublicationStatus.FAILED, errorMessage: message, retryCount, nextRetryAt },
    });
  }
}
