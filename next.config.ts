import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // ✅ رجعناها تاني
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  trailingSlash: true,
};

export default nextConfig;