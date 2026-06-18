import { PostScheduleCron } from './post-schedule.cron';
import { PostStatus } from '@inboudly/database';

it('only publishes posts it successfully claims (count===1)', async () => {
  const prisma = {
    post: {
      findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
      updateMany: jest.fn()
        .mockResolvedValueOnce({ count: 1 })   // p1 claimed
        .mockResolvedValueOnce({ count: 0 }),  // p2 already taken
    },
  } as any;
  const publisher = { publishPost: jest.fn().mockResolvedValue(undefined) } as any;
  const cron = new PostScheduleCron(prisma, publisher);
  await cron.runDuePosts();
  expect(publisher.publishPost).toHaveBeenCalledTimes(1);
  expect(publisher.publishPost).toHaveBeenCalledWith('p1');
});

it('reapStuckPublishing: fails PUBLISHING posts older than the cutoff', async () => {
  const updateMany = jest.fn().mockResolvedValue({ count: 2 });
  const prisma = { post: { updateMany } } as any;
  const cron = new PostScheduleCron(prisma, {} as any);
  await cron.reapStuckPublishing();
  expect(updateMany).toHaveBeenCalledTimes(1);
  const arg = updateMany.mock.calls[0][0];
  expect(arg.where.status).toBe(PostStatus.PUBLISHING);
  expect(arg.where.updatedAt.lt).toBeInstanceOf(Date);
  expect(arg.data.status).toBe(PostStatus.FAILED);
});
