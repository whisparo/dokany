import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: "standalone", // ✅ لازم عشان OpenNext يشتغل

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**',
        port: '',
        pathname: '**',
      },
    ],
  },

  // ❌ تم حذف webpack hook بالكامل
};

export default nextConfig;