import { PublishProcessor } from './publish.processor';

describe('PublishProcessor.ensureUsableAccount', () => {
  function setup() {
    const updateTokens = jest.fn().mockResolvedValue({ id: 'a1', accessToken: 'fresh' });
    const accounts = { updateTokens, markNeedsReconnect: jest.fn() } as any;
    const proc = new PublishProcessor({} as any, {} as any, accounts);
    return { updateTokens, accounts, proc };
  }
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 3_600_000);

  it('refreshes + persists when expired and the connector supports refresh', async () => {
    const { updateTokens, proc } = setup();
    const connector = { refreshToken: jest.fn().mockResolvedValue({ accessToken: 'fresh', refreshToken: 'rt', expiresAt: future }) } as any;
    const account = { id: 'a1', accessToken: 'stale', refreshToken: 'rt', tokenExpiresAt: past } as any;
    const out = await proc.ensureUsableAccount(account, connector);
    expect(connector.refreshToken).toHaveBeenCalledWith('rt');
    expect(updateTokens).toHaveBeenCalledWith('a1', { accessToken: 'fresh', tokenExpiresAt: future, refreshToken: 'rt' });
    expect(out.accessToken).toBe('fresh');
  });
  it('does not refresh when the token is still valid', async () => {
    const { proc } = setup();
    const connector = { refreshToken: jest.fn() } as any;
    await proc.ensureUsableAccount({ id: 'a1', refreshToken: 'rt', tokenExpiresAt: future } as any, connector);
    expect(connector.refreshToken).not.toHaveBeenCalled();
  });
  it('does not refresh when the connector has no refreshToken method', async () => {
    const { proc } = setup();
    const account = { id: 'a1', refreshToken: 'rt', tokenExpiresAt: past } as any;
    const out = await proc.ensureUsableAccount(account, {} as any);
    expect(out).toBe(account);
  });
});
