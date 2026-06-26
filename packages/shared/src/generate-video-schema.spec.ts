import { GenerateVideoSchema, VideoProviderSchema } from './schemas';

const WS = 'clxxxxxxxxxxxxxxxxxxxxxxx0'; // 25-char cuid-shaped id

describe('GenerateVideoSchema', () => {
  it('applies defaults when only workspaceId + prompt are given', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'a cat surfing' });
    expect(out.durationSec).toBe(5);
    expect(out.aspectRatio).toBe('9:16');
    expect(out.provider).toBeUndefined(); // omitted → server resolves
    expect(out.model).toBeUndefined();
  });

  it('accepts higgsfield as a provider', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', provider: 'higgsfield' });
    expect(out.provider).toBe('higgsfield');
  });

  it('accepts an arbitrary model string', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', model: 'higgsfield' });
    expect(out.model).toBe('higgsfield');
  });

  it('rejects an unknown provider', () => {
    expect(() => GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', provider: 'sora' }))
      .toThrow();
  });

  it('VideoProviderSchema enumerates higgsfield and hyperframes', () => {
    expect(VideoProviderSchema.options).toEqual(['higgsfield', 'hyperframes']);
  });

  it('accepts hyperframes as a provider', () => {
    const out = GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', provider: 'hyperframes' });
    expect(out.provider).toBe('hyperframes');
  });

  it('rejects durationSec outside [2, 10]', () => {
    expect(() => GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', durationSec: 1 })).toThrow();
    expect(() => GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', durationSec: 11 })).toThrow();
  });

  it('rejects a whitespace-only model', () => {
    expect(() => GenerateVideoSchema.parse({ workspaceId: WS, prompt: 'x', model: '   ' })).toThrow();
  });
});
