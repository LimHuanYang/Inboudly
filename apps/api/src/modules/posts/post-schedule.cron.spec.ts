import { PostScheduleCron } from './post-schedule.cron';

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
