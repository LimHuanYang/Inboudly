import { AiCredentialsService } from './ai-credentials.service';

// Build a service with stubbed dependencies; we only exercise resolveVideoProvider,
// which reads getDecryptedKey(). Video is now Higgsfield-only.
function makeService(opts: { keys?: Record<string, string | null> }) {
  const svc = new AiCredentialsService({} as any, {} as any);
  jest.spyOn(svc, 'getDecryptedKey').mockImplementation(
    async (_ws: string, field: any) => opts.keys?.[field] ?? null,
  );
  return svc;
}

describe('AiCredentialsService.resolveVideoProvider', () => {
  it('resolves higgsfield with an empty key when none is configured', async () => {
    const svc = makeService({});
    const r = await svc.resolveVideoProvider('ws1');
    expect(r.provider).toBe('higgsfield');
    expect(r.apiKey).toBe('');
    expect(r.model).toBe('higgsfield');
  });

  it('resolves higgsfield with the saved key', async () => {
    const svc = makeService({ keys: { higgsfieldKey: 'api_key:api_key_secret' } });
    const r = await svc.resolveVideoProvider('ws1');
    expect(r.provider).toBe('higgsfield');
    expect(r.apiKey).toBe('api_key:api_key_secret');
    expect(r.model).toBe('higgsfield');
  });

  it('ignores the override and still resolves higgsfield', async () => {
    const svc = makeService({ keys: { higgsfieldKey: 'k:s' } });
    const r = await svc.resolveVideoProvider('ws1', 'higgsfield');
    expect(r.provider).toBe('higgsfield');
    expect(r.apiKey).toBe('k:s');
  });
});
