import { ServiceUnavailableException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePublication(id: string, platform = 'YOUTUBE') {
  return {
    id,
    status: 'SUCCESS',
    platformPostUrl: `https://youtu.be/${id}`,
    socialAccount: { platform },
    postVariant: {
      caption: `Caption for ${id}`,
      post: { workspaceId: 'ws_1' },
    },
  };
}

function makeMetricsRow(publicationId: string, capturedAt: Date, overrides: Partial<{
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  videoViews: number;
}> = {}) {
  return {
    publicationId,
    capturedAt,
    likes: overrides.likes ?? 100,
    comments: overrides.comments ?? 20,
    shares: overrides.shares ?? 5,
    impressions: overrides.impressions ?? 500,
    videoViews: overrides.videoViews ?? 1000,
  };
}

/**
 * Build a minimal AnalyticsService with mocked prisma + queue.
 * queue.add is a jest.fn() that can be inspected by tests that need it.
 */
function buildService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    post: { count: jest.fn().mockResolvedValue(0) },
    socialAccount: { findMany: jest.fn().mockResolvedValue([]) },
    postPublication: { findMany: jest.fn().mockResolvedValue([]) },
    publicationMetrics: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };

  // AnalyticsService constructor: (prisma, pullQueue)
  const svc = new AnalyticsService(prisma as any, queue as any);
  return { svc, prisma, queue };
}

// ---------------------------------------------------------------------------
// postMetrics
// ---------------------------------------------------------------------------

describe('AnalyticsService.postMetrics', () => {
  it('returns one row per publication with the latest metrics', async () => {
    const pub = makePublication('pub_1');
    const metricsRow = makeMetricsRow('pub_1', new Date('2026-01-15T12:00:00Z'));

    const { svc, prisma } = buildService({
      postPublication: {
        findMany: jest.fn().mockResolvedValue([pub]),
      },
      publicationMetrics: {
        findFirst: jest.fn().mockResolvedValue(metricsRow),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await svc.postMetrics('ws_1');

    expect(result).toHaveLength(1);
    const row = result[0]!;
    expect(row.publicationId).toBe('pub_1');
    expect(row.platform).toBe('YOUTUBE');
    expect(row.caption).toBe('Caption for pub_1');
    expect(row.platformPostUrl).toBe('https://youtu.be/pub_1');
    expect(row.likes).toBe(100);
    expect(row.comments).toBe(20);
    expect(row.videoViews).toBe(1000);
    expect(row.capturedAt).toEqual(new Date('2026-01-15T12:00:00Z'));

    // Confirm findFirst was called with publicationId + desc ordering
    expect(prisma.publicationMetrics.findFirst).toHaveBeenCalledWith({
      where: { publicationId: 'pub_1' },
      orderBy: { capturedAt: 'desc' },
    });
  });

  it('returns null metric fields when no metrics row exists yet', async () => {
    const pub = makePublication('pub_no_metrics');

    const { svc } = buildService({
      postPublication: {
        findMany: jest.fn().mockResolvedValue([pub]),
      },
      publicationMetrics: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await svc.postMetrics('ws_1');
    expect(result).toHaveLength(1);
    expect(result[0]!.likes).toBeNull();
    expect(result[0]!.capturedAt).toBeNull();
  });

  it('returns empty array when no SUCCESS publications exist', async () => {
    const { svc } = buildService();
    const result = await svc.postMetrics('ws_1');
    expect(result).toEqual([]);
  });

  it('handles multiple publications independently', async () => {
    const pub1 = makePublication('pub_A');
    const pub2 = makePublication('pub_B', 'INSTAGRAM');
    const m1 = makeMetricsRow('pub_A', new Date('2026-01-10'), { videoViews: 50 });
    const m2 = makeMetricsRow('pub_B', new Date('2026-01-11'), { videoViews: 200 });

    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(m1)
      .mockResolvedValueOnce(m2);

    const { svc } = buildService({
      postPublication: {
        findMany: jest.fn().mockResolvedValue([pub1, pub2]),
      },
      publicationMetrics: {
        findFirst,
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await svc.postMetrics('ws_1');
    expect(result).toHaveLength(2);
    expect(result[0]!.videoViews).toBe(50);
    expect(result[1]!.videoViews).toBe(200);
    expect(result[1]!.platform).toBe('INSTAGRAM');
  });
});

// ---------------------------------------------------------------------------
// engagementTimeseries
// ---------------------------------------------------------------------------

describe('AnalyticsService.engagementTimeseries', () => {
  it('returns empty array when there are no publications', async () => {
    const { svc } = buildService({
      postPublication: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      publicationMetrics: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    });

    const result = await svc.engagementTimeseries('ws_1', 30);
    expect(result).toEqual([]);
  });

  it('groups metrics by ISO date and sums per day', async () => {
    const pubIds = [{ id: 'pub_1' }, { id: 'pub_2' }];

    const rows = [
      makeMetricsRow('pub_1', new Date('2026-01-10T08:00:00Z'), {
        likes: 10,
        comments: 2,
        impressions: 100,
        videoViews: 50,
      }),
      makeMetricsRow('pub_2', new Date('2026-01-10T20:00:00Z'), {
        likes: 5,
        comments: 1,
        impressions: 80,
        videoViews: 30,
      }),
      makeMetricsRow('pub_1', new Date('2026-01-11T10:00:00Z'), {
        likes: 20,
        comments: 4,
        impressions: 200,
        videoViews: 100,
      }),
    ];

    const { svc } = buildService({
      postPublication: {
        findMany: jest.fn().mockResolvedValue(pubIds),
      },
      publicationMetrics: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    });

    const result = await svc.engagementTimeseries('ws_1', 30);

    expect(result).toHaveLength(2);

    const jan10 = result.find((r) => r.date === '2026-01-10')!;
    expect(jan10.likes).toBe(15);       // 10 + 5
    expect(jan10.comments).toBe(3);     // 2 + 1
    expect(jan10.impressions).toBe(180); // 100 + 80
    expect(jan10.videoViews).toBe(80);  // 50 + 30

    const jan11 = result.find((r) => r.date === '2026-01-11')!;
    expect(jan11.likes).toBe(20);
    expect(jan11.videoViews).toBe(100);
  });

  it('returns rows ordered chronologically', async () => {
    const pubIds = [{ id: 'pub_1' }];
    const rows = [
      makeMetricsRow('pub_1', new Date('2026-01-15T00:00:00Z'), { likes: 1 }),
      makeMetricsRow('pub_1', new Date('2026-01-12T00:00:00Z'), { likes: 2 }),
      makeMetricsRow('pub_1', new Date('2026-01-14T00:00:00Z'), { likes: 3 }),
    ];

    const { svc } = buildService({
      postPublication: {
        findMany: jest.fn().mockResolvedValue(pubIds),
      },
      publicationMetrics: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue(rows),
      },
    });

    const result = await svc.engagementTimeseries('ws_1', 30);
    const dates = result.map((r) => r.date);
    expect(dates).toEqual(['2026-01-15', '2026-01-12', '2026-01-14']);
  });

  it('correctly passes the workspace filter and date window to findMany', async () => {
    const pubIds = [{ id: 'pub_1' }];

    const postPubFindMany = jest.fn().mockResolvedValue(pubIds);
    const metricsFindMany = jest.fn().mockResolvedValue([]);

    const { svc } = buildService({
      postPublication: {
        findMany: postPubFindMany,
      },
      publicationMetrics: {
        findFirst: jest.fn(),
        findMany: metricsFindMany,
      },
    });

    await svc.engagementTimeseries('ws_1', 7);

    // publications queried with workspaceId filter
    expect(postPubFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          postVariant: { post: { workspaceId: 'ws_1' } },
        }),
      }),
    );

    // metrics queried with the publication ids and a gte window
    expect(metricsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationId: { in: ['pub_1'] },
          capturedAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// enqueueRefresh
// ---------------------------------------------------------------------------

describe('AnalyticsService.enqueueRefresh', () => {
  it('adds a pull job to the queue with the workspaceId', async () => {
    const { svc, queue } = buildService();
    await svc.enqueueRefresh('ws_test');
    expect(queue.add).toHaveBeenCalledWith('pull', { workspaceId: 'ws_test' });
  });

  it('throws ServiceUnavailableException when queues are disabled (no queue injected)', async () => {
    const prisma = {
      post: { count: jest.fn() },
      socialAccount: { findMany: jest.fn() },
      postPublication: { findMany: jest.fn() },
      publicationMetrics: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    // No pullQueue injected — mirrors local dev without REDIS_URL.
    const svc = new AnalyticsService(prisma as any, undefined);
    await expect(svc.enqueueRefresh('ws_test')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
