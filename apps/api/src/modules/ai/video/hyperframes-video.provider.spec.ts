import { HyperframesVideoProvider } from './hyperframes-video.provider';
import { BadRequestException } from '@nestjs/common';

function deps() {
  const media = { register: jest.fn().mockResolvedValue({ id: 'asset1', url: 'https://cdn/x.mp4' }) } as any;
  const r2 = { putObject: jest.fn().mockResolvedValue('https://cdn/x.mp4') } as any;
  return { media, r2 };
}

const baseParams = (over: any = {}) => ({
  workspaceId: 'w', prompt: 'branded clip', durationSec: 6, aspectRatio: '9:16',
  model: 'bilingual-caption', templateId: 'bilingual-caption',
  variables: { brand_primary: '#ff3d8b', brand_font: 'Inter', caption_en: 'hi', caption_zh: '你好', width: 1080, height: 1920 },
  ...over,
});

it('rejects an unknown templateId before rendering', async () => {
  const { media, r2 } = deps();
  const p = new HyperframesVideoProvider(media, r2);
  await expect(p.generate('', baseParams({ templateId: 'nope' }))).rejects.toBeInstanceOf(BadRequestException);
  expect(r2.putObject).not.toHaveBeenCalled();
});

it('rejects when a required variable is missing', async () => {
  const { media, r2 } = deps();
  const p = new HyperframesVideoProvider(media, r2);
  await expect(
    p.generate('', baseParams({ variables: { brand_primary: '#000', brand_font: 'Inter', caption_en: 'hi' } })),
  ).rejects.toBeInstanceOf(BadRequestException); // caption_zh missing
  expect(r2.putObject).not.toHaveBeenCalled();
});

it('renders, uploads to R2, registers the asset, and returns it', async () => {
  const { media, r2 } = deps();
  const p = new HyperframesVideoProvider(media, r2);
  jest.spyOn(p as any, 'renderToBuffer').mockResolvedValue(Buffer.from('fake-mp4'));
  const out = await p.generate('', baseParams());
  expect(r2.putObject).toHaveBeenCalledWith(
    expect.stringMatching(/^videos\/hyperframes\/.*\.mp4$/), expect.any(Buffer), 'video/mp4',
  );
  expect(media.register).toHaveBeenCalledWith(expect.objectContaining({
    type: 'VIDEO', source: 'AI_GENERATED', width: 1080, height: 1920, durationSec: 6,
    aiModel: 'hyperframes:bilingual-caption',
  }));
  expect(out).toEqual({ asset: { id: 'asset1', url: 'https://cdn/x.mp4' }, model: 'hyperframes' });
});
