/** Subset of BrandKit fields the templates consume. */
export type BrandKitLike = {
  primaryColor: string;
  secondaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  logoUrl?: string | null;
  logoLightUrl?: string | null;
};

export type BrandVariables = {
  brand_primary: string;
  brand_accent: string;
  brand_font: string;
  logo_url: string;
};

/** Used when a workspace has no BrandKit yet — neutral, legible defaults. */
export const DEFAULT_BRAND_VARIABLES: BrandVariables = {
  brand_primary: '#111827',
  brand_accent: '#6366f1',
  brand_font: 'Inter, system-ui, sans-serif',
  logo_url: '',
};

/** Map a BrandKit (or null) to the composition's brand variables. Pure. */
export function brandToVariables(kit: BrandKitLike | null): BrandVariables {
  if (!kit) return DEFAULT_BRAND_VARIABLES;
  return {
    brand_primary: kit.primaryColor || DEFAULT_BRAND_VARIABLES.brand_primary,
    brand_accent: kit.accentColor || kit.secondaryColor || DEFAULT_BRAND_VARIABLES.brand_accent,
    brand_font: kit.fontFamily || DEFAULT_BRAND_VARIABLES.brand_font,
    logo_url: kit.logoUrl || kit.logoLightUrl || '',
  };
}
