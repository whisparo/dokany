import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // output: 'export', // ❌ تم إيقافه ليعمل المتجر بصورة ديناميكية على الـ Edge
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;