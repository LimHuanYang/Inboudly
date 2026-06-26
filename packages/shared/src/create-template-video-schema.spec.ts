import { CreateTemplateVideoSchema } from './schemas';

const WS = 'clz0000000000000000000000';

it('accepts a minimal bilingual-caption request', () => {
  const out = CreateTemplateVideoSchema.parse({
    workspaceId: WS,
    templateId: 'bilingual-caption',
    aspectRatio: '9:16',
    captionEn: 'Fresh today',
    captionZh: '今日新鲜',
  });
  expect(out.templateId).toBe('bilingual-caption');
  expect(out.aspectRatio).toBe('9:16');
});

it('rejects an unknown templateId', () => {
  expect(() =>
    CreateTemplateVideoSchema.parse({ workspaceId: WS, templateId: 'nope', aspectRatio: '1:1' }),
  ).toThrow();
});

it('defaults aspectRatio to 9:16', () => {
  const out = CreateTemplateVideoSchema.parse({ workspaceId: WS, templateId: 'launch', title: 'Spring menu' });
  expect(out.aspectRatio).toBe('9:16');
});
