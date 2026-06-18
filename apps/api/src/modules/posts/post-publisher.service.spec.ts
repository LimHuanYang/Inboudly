import { PostPublisherService, MAX_RETRIES } from './post-publisher.service';
import { PostStatus, PublicationStatus } from '@inboudly/database';

function makeDeps(post: any) {
  const updates: any[] = [];
  const prisma = {
    post: {
      findUnique: jest.fn().mockResolvedValue(post),
      update: jest.fn((args: any) => { updates.push(args.data); return Promise.resolve({}); }),
    },
    postPublication: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
  } as any;
  const accounts = { updateTokens: jest.fn(), markNeedsReconnect: jest.fn() } as any;
  return { prisma, accounts, updates };
}

it('marks PARTIALLY_PUBLISHED when one platform has no active account', async () => {
  const post = {
    id: 'post1', workspaceId: 'w',
    variants: [
      { id: 'v-ig', platform: 'INSTAGRAM', media: [], publications: [] },
      { id: 'v-li', platform: 'LINKEDIN', media: [], publications: [] },
    ],
    workspace: { socialAccounts: [{ id: 'a-ig', platform: 'INSTAGRAM', status: 'ACTIVE' }] },
  };
  const { prisma, accounts, updates } = makeDeps(post);
  const connectors = { get: () => ({ publish: jest.fn().mockResolvedValue({ platformPostId: 'p', platformPostUrl: 'u' }) }) } as any;
  const svc = new PostPublisherService(prisma, connectors, accounts);
  await svc.publishPost('post1');
  expect(updates.at(-1).status).toBe(PostStatus.PARTIALLY_PUBLISHED);
});

it('does not re-publish a platform already SUCCESS (idempotent)', async () => {
  const publish = jest.fn().mockResolvedValue({ platformPostId: 'p', platformPostUrl: 'u' });
  const post = {
    id: 'post1', workspaceId: 'w',
    variants: [{ id: 'v-ig', platform: 'INSTAGRAM', media: [],
      publications: [{ socialAccountId: 'a-ig', status: PublicationStatus.SUCCESS }] }],
    workspace: { socialAccounts: [{ id: 'a-ig', platform: 'INSTAGRAM', status: 'ACTIVE' }] },
  };
  const { prisma, accounts, updates } = makeDeps(post);
  const connectors = { get: () => ({ publish }) } as any;
  const svc = new PostPublisherService(prisma, connectors, accounts);
  await svc.publishPost('post1');
  expect(publish).not.toHaveBeenCalled();
  expect(updates.at(-1).status).toBe(PostStatus.PUBLISHED);
});

it('stops scheduling retries after MAX_RETRIES (nextRetryAt null)', async () => {
  const post = {
    id: 'post1', workspaceId: 'w',
    variants: [{ id: 'v-ig', platform: 'INSTAGRAM', media: [], publications: [] }],
    workspace: { socialAccounts: [{ id: 'a-ig', platform: 'INSTAGRAM', status: 'ACTIVE' }] },
  };
  const upserts: any[] = [];
  const prisma = {
    post: { findUnique: jest.fn().mockResolvedValue(post), update: jest.fn().mockResolvedValue({}) },
    postPublication: {
      findUnique: jest.fn().mockResolvedValue({ retryCount: MAX_RETRIES }),
      upsert: jest.fn((a: any) => { upserts.push(a.update); return Promise.resolve({}); }),
    },
  } as any;
  const connectors = { get: () => ({ publish: jest.fn().mockRejectedValue(new Error('boom')) }) } as any;
  const accounts = { updateTokens: jest.fn(), markNeedsReconnect: jest.fn() } as any;
  const svc = new PostPublisherService(prisma, connectors, accounts);
  await svc.publishPost('post1');
  expect(upserts[0].retryCount).toBe(MAX_RETRIES + 1);
  expect(upserts[0].nextRetryAt).toBeNull();
});
