import { SocialAccountsService } from './social-accounts.service';
import { AccountStatus } from '@inboudly/database';

describe('SocialAccountsService token helpers', () => {
  function setup() {
    const update = jest.fn().mockResolvedValue({ id: 'a1' });
    const prisma = { socialAccount: { update } } as any;
    return { update, svc: new SocialAccountsService(prisma) };
  }
  it('updateTokens persists access token + expiry (+ refresh token when given)', async () => {
    const { update, svc } = setup();
    const exp = new Date();
    await svc.updateTokens('a1', { accessToken: 'at2', tokenExpiresAt: exp, refreshToken: 'rt2' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { accessToken: 'at2', tokenExpiresAt: exp, refreshToken: 'rt2' } });
  });
  it('updateTokens omits refreshToken when not provided', async () => {
    const { update, svc } = setup();
    await svc.updateTokens('a1', { accessToken: 'at2', tokenExpiresAt: null });
    expect(update.mock.calls[0]![0].data).not.toHaveProperty('refreshToken');
  });
  it('markNeedsReconnect sets status PENDING_REAUTH', async () => {
    const { update, svc } = setup();
    await svc.markNeedsReconnect('a1');
    expect(update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { status: AccountStatus.PENDING_REAUTH } });
  });
});
