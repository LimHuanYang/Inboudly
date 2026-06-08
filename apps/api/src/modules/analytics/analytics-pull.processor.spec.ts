import { AnalyticsPullProcessor } from './analytics-pull.processor';
import type { Job } from 'bullmq';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePublication(overrides: Partial<{
  id: string;
  platformPostId: string | null;
  status: string;
  socialAccount: { id: string; platform: string; accessToken: string };
}> = {}) {
  return {
    id: overrides.id ?? 'pub_1',
    status: overrides.status ?? 'SUCCESS',
    platformPostId: overrides.platformPostId !== undefined ? overrides.platformPostId : 'yt_vid_1',
    socialAccount: overrides.socialAccount ?? {
      id: 'acc_1',
      platform: 'YOUTUBE',
      accessToken: 'tok',
    },
    postVariant: { post: { workspaceId: 'ws_1' } },
  };
}

function makeJob(workspaceId = 'ws_1'): Job<{ workspaceId: string }> {
  return { data: { workspaceId } } as Job<{ workspaceId: string }>;
}

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

function makePrismaMock(publications: ReturnType<typeof makePublication>[]) {
  return {
    postPublication: {
      findMany: jest.fn().mockResolvedValue(publications),
    },
    publicationMetrics: {
      create: jest.fn().mockResolvedValue({ id: 'metric_1' }),
    },
  };
}

// ---------------------------------------------------------------------------
// ConnectorRegistry mock factory
// ---------------------------------------------------------------------------

/** Returns a registry whose get() returns a connector WITH getPostMetrics */
function makeRegistryWith(platform: string, metrics: object) {
  const connectorWith = {
    getPostMetrics: jest.fn().mockResolvedValue(metrics),
  };
  return {
    get: jest.fn().mockReturnValue(connectorWith),
    _connectorWith: connectorWith,
  };
}

/** Returns a registry whose get() returns a connector WITHOUT getPostMetrics */
function makeRegistryWithout() {
  const connectorWithout = { publish: jest.fn() }; // no getPostMetrics
  return {
    get: jest.fn().mockReturnValue(connectorWithout),
    _connectorWithout: connectorWithout,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsPullProcessor', () => {
  describe('process — connector WITH getPostMetrics', () => {
    it('creates a publicationMetrics row for each qualifying publication', async () => {
      const pub = makePublication();
      const prisma = makePrismaMock([pub]);
      const metrics = {
        likes: 100,
        comments: 20,
        shares: 5,
        saves: 3,
        reach: 500,
        impressions: 800,
        videoViews: 1200,
        extra: { raw: { viewCount: '1200' } },
      };
      const registry = makeRegistryWith('YOUTUBE', metrics);

      const processor = new AnalyticsPullProcessor(prisma as any, registry as any);
      await processor.process(makeJob());

      expect(prisma.publicationMetrics.create).toHaveBeenCalledTimes(1);
      const createArg = (prisma.publicationMetrics.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.publicationId).toBe('pub_1');
      expect(createArg.data.likes).toBe(100);
      expect(createArg.data.comments).toBe(20);
      expect(createArg.data.videoViews).toBe(1200);
      expect(createArg.data.capturedAt).toBeInstanceOf(Date);
    });

    it('passes the correct account and platformPostId to getPostMetrics', async () => {
      const pub = makePublication({ platformPostId: 'vid_xyz' });
      const prisma = makePrismaMock([pub]);
      const registry = makeRegistryWith('YOUTUBE', { likes: 1 });

      const processor = new AnalyticsPullProcessor(prisma as any, registry as any);
      await processor.process(makeJob());

      expect(registry._connectorWith.getPostMetrics).toHaveBeenCalledWith(
        pub.socialAccount,
        'vid_xyz',
      );
    });
  });

  describe('process — connector WITHOUT getPostMetrics', () => {
    it('does NOT create a publicationMetrics row', async () => {
      const pub = makePublication({ id: 'pub_no_metrics' });
      const prisma = makePrismaMock([pub]);
      const registry = makeRegistryWithout();

      const processor = new AnalyticsPullProcessor(prisma as any, registry as any);
      await processor.process(makeJob());

      expect(prisma.publicationMetrics.create).not.toHaveBeenCalled();
    });
  });

  describe('process — error isolation', () => {
    it('a failing getPostMetrics for one publication does not abort the batch', async () => {
      const pub1 = makePublication({ id: 'pub_err', platformPostId: 'vid_err' });
      const pub2 = makePublication({ id: 'pub_ok', platformPostId: 'vid_ok' });

      const prisma = makePrismaMock([pub1, pub2]);
      const connectorWithError = {
        getPostMetrics: jest
          .fn()
          .mockRejectedValueOnce(new Error('API rate limit'))
          .mockResolvedValueOnce({ likes: 50 }),
      };
      const registry = { get: jest.fn().mockReturnValue(connectorWithError) };

      const processor = new AnalyticsPullProcessor(prisma as any, registry as any);
      await processor.process(makeJob());

      // pub_ok should still get a metrics row even though pub_err failed
      expect(prisma.publicationMetrics.create).toHaveBeenCalledTimes(1);
      const createArg = (prisma.publicationMetrics.create as jest.Mock).mock.calls[0][0];
      expect(createArg.data.publicationId).toBe('pub_ok');
    });

    it('does not throw when every publication errors', async () => {
      const pub = makePublication();
      const prisma = makePrismaMock([pub]);
      const connector = {
        getPostMetrics: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const registry = { get: jest.fn().mockReturnValue(connector) };

      const processor = new AnalyticsPullProcessor(prisma as any, registry as any);
      await expect(processor.process(makeJob())).resolves.not.toThrow();
      expect(prisma.publicationMetrics.create).not.toHaveBeenCalled();
    });
  });

  describe('process — mixed batch (one with, one without getPostMetrics)', () => {
    it('only writes a row for the connector that implements getPostMetrics', async () => {
      const pubWith = makePublication({ id: 'pub_with', platformPostId: 'vid_1' });
      const pubWithout = makePublication({ id: 'pub_without', platformPostId: 'vid_2' });

      const prisma = makePrismaMock([pubWith, pubWithout]);
      const connectorWith = {
        getPostMetrics: jest.fn().mockResolvedValue({ likes: 42 }),
      };
      const connectorWithout = { publish: jest.fn() };

      const registry = {
        get: jest
          .fn()
          .mockReturnValueOnce(connectorWith)   // first call → pubWith
          .mockReturnValueOnce(connectorWithout), // second call → pubWithout
      };

      const processor = new AnalyticsPullProcessor(prisma as any, registry as any);
      await processor.process(makeJob());

      expect(prisma.publicationMetrics.create).toHaveBeenCalledTimes(1);
      expect(
        (prisma.publicationMetrics.create as jest.Mock).mock.calls[0][0].data.publicationId,
      ).toBe('pub_with');
    });
  });
});
