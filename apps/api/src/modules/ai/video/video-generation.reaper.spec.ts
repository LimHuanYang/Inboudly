import { VideoGenerationService } from './video-generation.service';
import { VideoStatus } from '@inboudly/database';

describe('VideoGenerationService.reapStaleJobs', () => {
  it('fails GENERATING jobs older than the cutoff', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = { videoGeneration: { updateMany } } as any;
    // Constructor: (prisma, credentials, demo, pollinations) — only prisma is used here.
    const svc = new VideoGenerationService(prisma, {} as any, {} as any, {} as any);
    await svc.reapStaleJobs();
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe(VideoStatus.GENERATING);
    expect(arg.where.updatedAt.lt).toBeInstanceOf(Date);
    expect(arg.data.status).toBe(VideoStatus.FAILED);
  });
});
