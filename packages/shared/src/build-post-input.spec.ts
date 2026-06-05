import { buildCreatePostInput, parseHashtags } from './build-post-input';

const WS = 'clxxxxxxxxxxxxxxxxxxxxxxx0';
const M1 = 'clmediaaaaaaaaaaaaaaaaaaa1';

describe('parseHashtags', () => {
  it('splits on whitespace and strips leading #', () => {
    expect(parseHashtags('#skincare #summer  glow')).toEqual(['skincare', 'summer', 'glow']);
  });
  it('drops empties and handles undefined/blank', () => {
    expect(parseHashtags('   ')).toEqual([]);
    expect(parseHashtags(undefined)).toEqual([]);
    expect(parseHashtags('##x')).toEqual(['x']);
  });
});

describe('buildCreatePostInput', () => {
  it('builds one variant per selected platform with trimmed caption, parsed hashtags, and media', () => {
    const out = buildCreatePostInput({
      workspaceId: WS,
      selectedPlatforms: ['INSTAGRAM', 'TIKTOK'],
      captions: { INSTAGRAM: '  hi there  ', TIKTOK: 'yo' } as any,
      hashtags: { INSTAGRAM: '#a #b', TIKTOK: '' } as any,
      attachedImageIds: { INSTAGRAM: [M1], TIKTOK: [] } as any,
    });
    expect(out.workspaceId).toBe(WS);
    expect(out.approvalRequired).toBe(false);
    expect(out.variants).toHaveLength(2);
    expect(out.variants[0]).toEqual({
      platform: 'INSTAGRAM',
      caption: 'hi there',
      language: 'en',
      hashtags: ['a', 'b'],
      mentions: [],
      mediaAssetIds: [M1],
    });
    expect(out.variants[1]).toEqual({
      platform: 'TIKTOK',
      caption: 'yo',
      language: 'en',
      hashtags: [],
      mentions: [],
      mediaAssetIds: [],
    });
  });

  it('only includes selected platforms and tolerates missing per-platform entries', () => {
    const out = buildCreatePostInput({
      workspaceId: WS,
      selectedPlatforms: ['REDNOTE'],
      captions: {} as any,
      hashtags: {} as any,
      attachedImageIds: {} as any,
    });
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]).toEqual({
      platform: 'REDNOTE',
      caption: '',
      language: 'en',
      hashtags: [],
      mentions: [],
      mediaAssetIds: [],
    });
  });
});
