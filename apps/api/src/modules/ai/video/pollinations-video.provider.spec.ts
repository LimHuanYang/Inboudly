import { PollinationsVideoProvider } from './pollinations-video.provider';

describe('PollinationsVideoProvider', () => {
  const realFetch = (global as any).fetch;
  afterEach(() => { (global as any).fetch = realFetch; });

  function setup() {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0, 0, 0, 1]).buffer),
    });
    (global as any).fetch = fetchMock;
    const r2 = { putObject: jest.fn().mockResolvedValue('https://r2.example/v/x.mp4') } as any;
    const media = { register: jest.fn().mockResolvedValue({ id: 'media_1', url: 'https://r2.example/v/x.mp4' }) } as any;
    return { fetchMock, r2, media, provider: new PollinationsVideoProvider(media, r2) };
  }

  it('GETs gen.pollinations.ai with a bearer key, persists to R2, registers a VIDEO asset', async () => {
    const { fetchMock, r2, media, provider } = setup();
    const result = await provider.generate('sk_test', {
      workspaceId: 'ws1', prompt: 'a cat surfing', durationSec: 5, aspectRatio: '9:16', model: 'seedance',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://gen.pollinations.ai/video/');
    expect(url).toContain('model=seedance');
    expect(url).toContain('duration=5');
    expect(url).toContain('aspectRatio=9%3A16');
    expect(init.headers.Authorization).toBe('Bearer sk_test');
    expect(r2.putObject).toHaveBeenCalledTimes(1);
    const reg = media.register.mock.calls[0][0];
    expect(reg.type).toBe('VIDEO');
    expect(reg.source).toBe('AI_GENERATED');
    expect(reg.aiModel).toBe('seedance');
    expect(reg.aiPrompt).toBe('a cat surfing');
    expect(result).toEqual({ asset: { id: 'media_1', url: 'https://r2.example/v/x.mp4' }, model: 'seedance' });
    expect(provider.name).toBe('pollinations');
  });

  it('clamps veo duration to the nearest of 4/6/8', async () => {
    const { fetchMock, provider } = setup();
    await provider.generate('k', { workspaceId: 'w', prompt: 'x', durationSec: 5, aspectRatio: '16:9', model: 'veo' });
    expect(fetchMock.mock.calls[0][0]).toContain('duration=4');
  });

  it('throws a useful error on a non-OK response', async () => {
    const { provider } = setup();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 402, text: () => Promise.resolve('no credit') });
    await expect(
      provider.generate('k', { workspaceId: 'w', prompt: 'x', durationSec: 5, aspectRatio: '1:1', model: 'seedance' }),
    ).rejects.toThrow(/402/);
  });
});
