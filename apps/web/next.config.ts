import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
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
