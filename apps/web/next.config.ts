import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // StrictMode double-renders everything in dev to surface bugs. Useful before
  // ship, painful during fast iteration. Turning OFF in dev only — Vercel
  // production builds re-enable it via NODE_ENV check below.
  reactStrictMode: process.env.NODE_ENV === 'production',
  // typedRoutes disabled in dev — adds a slow per-route check, not worth the speed cost.
  // Re-enable for prod builds if you want compile-time route validation.
  experimental: {
    // The single biggest dev-mode speed win: Next.js generates barrel-file
    // shortcuts for these packages so Turbopack only walks the icons / components
    // you actually use, not every export. Cuts per-route compile by 60–80% in
    // apps that use lots of icons/UI primitives.
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-avatar',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
      '@tanstack/react-query',
      'date-fns',
      'sonner',
    ],
    // Keep HMR cache warm across navigations
    serverComponentsHmrCache: true,
  },
  transpilePackages: ['@inboudly/shared', '@inboudly/database'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: 'media.inboudly.com' },
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
    ],
  },
};

export default nextConfig;
