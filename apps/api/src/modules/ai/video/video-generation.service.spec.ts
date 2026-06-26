import { VideoGenerationService } from './video-generation.service';
import { VideoStatus } from '@inboudly/database';

function makePrisma(recentReady: any[] = []) {
  const created: any[] = [];
  return {
    created,
    prisma: {
      brandKit: { findFirst: jest.fn().mockResolvedValue({ primaryColor: '#ff3d8b', fontFamily: 'Inter' }) },
      videoGeneration: {
        findMany: jest.fn().mockResolvedValue(recentReady),
        create: jest.fn((a: any) => { created.push(a.data); return Promise.resolve({ id: 'job1', ...a.data }); }),
      },
    } as any,
  };
}

it('createTemplateJob builds variables and creates a GENERATING hyperframes job', async () => {
  const { prisma, created } = makePrisma();
  const svc = new VideoGenerationService(prisma, {} as any, {} as any, { name: 'hyperframes' } as any);
  jest.spyOn(svc as any, 'run').mockReturnValue(undefined);
  await svc.createTemplateJob({ workspaceId: 'w', templateId: 'bilingual-caption', aspectRatio: '9:16', captionEn: 'hi' });
  const data = created[0];
  expect(data.provider).toBe('hyperframes');
  expect(data.status).toBe(VideoStatus.GENERATING);
  expect(data.templateId).toBe('bilingual-caption');
  expect(data.variables.width).toBe(1080);
  expect(data.variables.height).toBe(1920);
  expect(data.variables.brand_primary).toBe('#ff3d8b');
  expect(data.variables.caption_en).toBe('hi');
});

it('createTemplateJob reuses a prior READY render with the same hash (cache hit)', async () => {
  const first = makePrisma();
  const svc = new VideoGenerationService(first.prisma, {} as any, {} as any, { name: 'hyperframes' } as any);
  jest.spyOn(svc as any, 'run').mockReturnValue(undefined);
  await svc.createTemplateJob({ workspaceId: 'w', templateId: 'launch', aspectRatio: '1:1', title: 'X', cta: 'Go' });
  const hash = first.created[0].variables.__hash as string;

  const second = makePrisma([{ mediaAssetId: 'asset9', variables: { __hash: hash } }]);
  const svc2 = new VideoGenerationService(second.prisma, {} as any, {} as any, { name: 'hyperframes' } as any);
  const runSpy = jest.spyOn(svc2 as any, 'run').mockReturnValue(undefined);
  const job = await svc2.createTemplateJob({ workspaceId: 'w', templateId: 'launch', aspectRatio: '1:1', title: 'X', cta: 'Go' });
  expect(runSpy).not.toHaveBeenCalled();
  expect((job as any).status).toBe(VideoStatus.READY);
  expect((job as any).mediaAssetId).toBe('asset9');
});
