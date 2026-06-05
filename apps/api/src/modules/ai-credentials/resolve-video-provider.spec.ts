import { AiCredentialsService } from './ai-credentials.service';

// Build a service with stubbed dependencies; we only exercise resolveVideoProvider,
// which reads getRecord() and getDecryptedKey().
function makeService(opts: {
  preferredVideoProvider?: string | null;
  runwayModel?: string | null;
  keys?: Record<string, string | null>;
}) {
  const record = {
    preferredVideoProvider: opts.preferredVideoProvider ?? null,
    runwayModel: opts.runwayModel ?? null,
  } as any;
  const svc = new AiCredentialsService({} as any, {} as any);
  jest.spyOn(svc, 'getRecord').mockResolvedValue(record);
  jest.spyOn(svc, 'getDecryptedKey').mockImplementation(
    async (_ws: string, field: any) => opts.keys?.[field] ?? null,
  );
  return svc;
}

describe('AiCredentialsService.resolveVideoProvider', () => {
  it('defaults to demo when nothing is configured', async () => {
    const svc = makeService({});
    const r = await svc.resolveVideoProvider('ws1');
    expect(r.provider).toBe('demo');
    expect(r.apiKey).toBe('');
    expect(r.model).toBe('demo');
  });

  it('honours preferred=demo', async () => {
    const svc = makeService({ preferredVideoProvider: 'demo' });
    expect((await svc.resolveVideoProvider('ws1')).provider).toBe('demo');
  });

  it('falls back to demo for a not-yet-implemented preferred provider (runway), even with a key', async () => {
    const svc = makeService({ preferredVideoProvider: 'runway', keys: { runwayKey: 'rk_live_xxx' } });
    // Plan 1: only demo is implemented, so resolution falls through to demo.
    expect((await svc.resolveVideoProvider('ws1')).provider).toBe('demo');
  });

  it('honours a per-request override but still falls back to demo when unimplemented', async () => {
    const svc = makeService({});
    expect((await svc.resolveVideoProvider('ws1', 'kling')).provider).toBe('demo');
  });

  it('resolves pollinations when a pollinationsKey is present', async () => {
    const svc = makeService({ preferredVideoProvider: 'pollinations', keys: { pollinationsKey: 'sk_live_x' } });
    const r = await svc.resolveVideoProvider('ws1');
    expect(r.provider).toBe('pollinations');
    expect(r.apiKey).toBe('sk_live_x');
  });

  it('falls back to demo when pollinations is preferred but no key is saved', async () => {
    const svc = makeService({ preferredVideoProvider: 'pollinations' });
    expect((await svc.resolveVideoProvider('ws1')).provider).toBe('demo');
  });
});
