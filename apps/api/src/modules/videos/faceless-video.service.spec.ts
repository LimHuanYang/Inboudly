import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { FacelessVideoService } from './faceless-video.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// `queue: null` explicitly models "queues disabled" (no queue injected).
// Omitting it injects a working mock queue. We use null (not undefined) as the
// sentinel so it never collides with a default-parameter value.
function buildService(
  videoProjectOverrides: Record<string, unknown> = {},
  queue: { add: jest.Mock } | null = { add: jest.fn().mockResolvedValue({}) },
) {
  const prisma = {
    videoProject: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'proj-1', exportStatus: 'GENERATING' }),
      ...videoProjectOverrides,
    },
  } as any;
  const credentials = {} as any;
  const r2 = {} as any;

  // Constructor: (prisma, credentials, r2, exportQueue?)
  const svc = new FacelessVideoService(prisma, credentials, r2, (queue ?? undefined) as any);
  return { svc, prisma, queue };
}

// ---------------------------------------------------------------------------
// exportProject — workspace scoping (I1) + queue guard (C1)
// ---------------------------------------------------------------------------

describe('FacelessVideoService.exportProject', () => {
  it('scopes the project lookup to the workspace (findFirst with id + workspaceId)', async () => {
    const { svc, prisma, queue } = buildService({
      findFirst: jest.fn().mockResolvedValue({
        id: 'proj-1',
        workspaceId: 'ws_1',
        scenes: [{ id: 's0', videoUrl: 'https://cdn/s0.mp4' }],
      }),
    });

    await svc.exportProject('proj-1', 'ws_1');

    expect(prisma.videoProject.findFirst).toHaveBeenCalledWith({
      where: { id: 'proj-1', workspaceId: 'ws_1' },
      include: { scenes: { where: { videoUrl: { not: null } } } },
    });
    expect(queue!.add).toHaveBeenCalledTimes(1);
  });

  it('throws NotFoundException when the project is not in the workspace (IDOR guard)', async () => {
    const { svc, queue } = buildService({
      findFirst: jest.fn().mockResolvedValue(null),
    });

    await expect(svc.exportProject('proj-1', 'other-ws')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(queue!.add).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when the export queue is absent (queues disabled)', async () => {
    const { svc, prisma } = buildService({}, null);

    await expect(svc.exportProject('proj-1', 'ws_1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // Guard short-circuits before any DB access.
    expect(prisma.videoProject.findFirst).not.toHaveBeenCalled();
  });
});
