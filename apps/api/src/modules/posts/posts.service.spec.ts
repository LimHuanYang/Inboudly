import { PostsService } from './posts.service';
import { PostStatus } from '@inboudly/database';
import { ConflictException } from '@nestjs/common';

function makeTx() {
  return {
    postVariant: {
      deleteMany: jest.fn().mockResolvedValue({}),
      create: jest.fn((a: any) => Promise.resolve({ id: 'v-new', ...a.data })),
    },
    postMedia: { create: jest.fn().mockResolvedValue({}) },
    post: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'p1' }),
    },
  };
}

const baseInput = (over: any = {}) =>
  ({
    workspaceId: 'w',
    title: 'edited',
    variants: [
      {
        platform: 'INSTAGRAM',
        caption: 'hi',
        language: 'en',
        hashtags: [],
        mentions: [],
        mediaAssetIds: [],
        platformOptions: {},
      },
    ],
    ...over,
  }) as any;

it('refuses to edit a post that is already (partly) live', async () => {
  const prisma = {
    post: { findUnique: jest.fn().mockResolvedValue({ status: PostStatus.PUBLISHED }) },
  } as any;
  const svc = new PostsService(prisma);
  await expect(svc.updateContent('p1', baseInput())).rejects.toBeInstanceOf(ConflictException);
});

it('replaces variants and re-schedules when scheduledFor is set', async () => {
  const tx = makeTx();
  const prisma = {
    post: { findUnique: jest.fn().mockResolvedValue({ status: PostStatus.SCHEDULED }) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  const svc = new PostsService(prisma);
  await svc.updateContent('p1', baseInput({ scheduledFor: new Date(Date.now() + 3_600_000).toISOString() }));
  expect(tx.postVariant.deleteMany).toHaveBeenCalledWith({ where: { postId: 'p1' } });
  expect(tx.postVariant.create).toHaveBeenCalledTimes(1);
  expect(tx.post.updateMany.mock.calls[0][0].data.status).toBe(PostStatus.SCHEDULED);
});

it('resets a FAILED post to DRAFT when edited with no schedule', async () => {
  const tx = makeTx();
  const prisma = {
    post: { findUnique: jest.fn().mockResolvedValue({ status: PostStatus.FAILED }) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  const svc = new PostsService(prisma);
  await svc.updateContent('p1', baseInput());
  expect(tx.post.updateMany.mock.calls[0][0].data.status).toBe(PostStatus.DRAFT);
  expect(tx.post.updateMany.mock.calls[0][0].data.scheduledFor).toBeNull();
});

it('refuses to edit if the post was claimed for publishing mid-edit (atomic guard)', async () => {
  const tx = makeTx();
  tx.post.updateMany.mockResolvedValue({ count: 0 }); // claim lost — the cron took it
  const prisma = {
    post: { findUnique: jest.fn().mockResolvedValue({ status: PostStatus.SCHEDULED }) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  } as any;
  const svc = new PostsService(prisma);
  await expect(svc.updateContent('p1', baseInput())).rejects.toBeInstanceOf(ConflictException);
  expect(tx.postVariant.deleteMany).not.toHaveBeenCalled();
});
