import { ForbiddenException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function build(assertMemberImpl?: jest.Mock) {
  const analytics = {
    overview: jest.fn().mockResolvedValue({ ok: true }),
    postMetrics: jest.fn().mockResolvedValue([]),
    engagementTimeseries: jest.fn().mockResolvedValue([]),
    enqueueRefresh: jest.fn().mockResolvedValue(undefined),
  };
  const workspaces = {
    assertMember: assertMemberImpl ?? jest.fn().mockResolvedValue({ role: 'OWNER' }),
  };
  const controller = new AnalyticsController(analytics as any, workspaces as any);
  return { controller, analytics, workspaces };
}

const user = { supabaseUserId: 'user_1' };

// ---------------------------------------------------------------------------
// Membership enforcement (I2)
// ---------------------------------------------------------------------------

describe('AnalyticsController membership enforcement', () => {
  it('overview asserts membership before returning data', async () => {
    const { controller, analytics, workspaces } = build();
    await controller.overview('ws_1', user, '7');
    expect(workspaces.assertMember).toHaveBeenCalledWith('ws_1', 'user_1');
    expect(analytics.overview).toHaveBeenCalledWith('ws_1', 7);
  });

  it('postMetrics asserts membership before returning data', async () => {
    const { controller, analytics, workspaces } = build();
    await controller.postMetrics('ws_1', user);
    expect(workspaces.assertMember).toHaveBeenCalledWith('ws_1', 'user_1');
    expect(analytics.postMetrics).toHaveBeenCalledWith('ws_1');
  });

  it('timeseries asserts membership before returning data', async () => {
    const { controller, analytics, workspaces } = build();
    await controller.timeseries('ws_1', user, undefined);
    expect(workspaces.assertMember).toHaveBeenCalledWith('ws_1', 'user_1');
    expect(analytics.engagementTimeseries).toHaveBeenCalledWith('ws_1', 30);
  });

  it('refresh asserts membership before enqueueing', async () => {
    const { controller, analytics, workspaces } = build();
    await controller.refresh('ws_1', user);
    expect(workspaces.assertMember).toHaveBeenCalledWith('ws_1', 'user_1');
    expect(analytics.enqueueRefresh).toHaveBeenCalledWith('ws_1');
  });

  it('does not touch the service when membership check rejects (non-member blocked)', async () => {
    const reject = jest.fn().mockRejectedValue(new ForbiddenException());
    const { controller, analytics } = build(reject);

    await expect(controller.overview('ws_x', user, undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.postMetrics('ws_x', user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.timeseries('ws_x', user, undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.refresh('ws_x', user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(analytics.overview).not.toHaveBeenCalled();
    expect(analytics.postMetrics).not.toHaveBeenCalled();
    expect(analytics.engagementTimeseries).not.toHaveBeenCalled();
    expect(analytics.enqueueRefresh).not.toHaveBeenCalled();
  });
});
