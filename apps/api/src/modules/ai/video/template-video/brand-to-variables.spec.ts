import { brandToVariables, DEFAULT_BRAND_VARIABLES } from './brand-to-variables';

it('maps BrandKit fields to composition variables', () => {
  const out = brandToVariables({
    primaryColor: '#ff3d8b', secondaryColor: '#222', accentColor: '#f5d90a',
    fontFamily: 'Space Grotesk', logoUrl: 'https://cdn/logo.png', logoLightUrl: null,
  });
  expect(out).toEqual({
    brand_primary: '#ff3d8b', brand_accent: '#f5d90a',
    brand_font: 'Space Grotesk', logo_url: 'https://cdn/logo.png',
  });
});

it('uses accent ?? secondary for brand_accent, and logoUrl ?? logoLightUrl', () => {
  const out = brandToVariables({
    primaryColor: '#000', secondaryColor: '#abc', accentColor: null,
    fontFamily: null, logoUrl: null, logoLightUrl: 'https://cdn/light.png',
  });
  expect(out.brand_accent).toBe('#abc');
  expect(out.logo_url).toBe('https://cdn/light.png');
});

it('returns safe defaults when the kit is null', () => {
  expect(brandToVariables(null)).toEqual(DEFAULT_BRAND_VARIABLES);
});
