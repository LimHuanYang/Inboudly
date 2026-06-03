import { DemoVideoProvider } from './demo-video.provider';

describe('DemoVideoProvider', () => {
  it('registers a VIDEO MediaAsset and returns its id + url', async () => {
    const register = jest.fn().mockResolvedValue({ id: 'media_1', url: '/demo/sample-clip.mp4' });
    const media = { register } as any;
    const provider = new DemoVideoProvider(media, 0); // 0ms delay for the test

    const result = await provider.generate('', {
      workspaceId: 'ws1',
      prompt: 'a dog skateboarding',
      durationSec: 7,
      aspectRatio: '9:16',
      model: 'demo',
    });

    expect(register).toHaveBeenCalledTimes(1);
    const arg = register.mock.calls[0][0];
    expect(arg.type).toBe('VIDEO');
    expect(arg.source).toBe('AI_GENERATED');
    expect(arg.url).toBe('/demo/sample-clip.mp4');
    expect(arg.durationSec).toBe(7);
    expect(arg.aiModel).toBe('demo');
    expect(arg.aiPrompt).toBe('a dog skateboarding');

    expect(result.asset).toEqual({ id: 'media_1', url: '/demo/sample-clip.mp4' });
    expect(result.model).toBe('demo');
    expect(provider.name).toBe('demo');
  });
});
