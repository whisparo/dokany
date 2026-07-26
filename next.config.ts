import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' }, // 👈 تصحيح صحيح 100%
    ],
  },
  experimental: {
    optimizeCss: true, // لدمج وحل مشاكل الـ CSS Render-blocking
  },
};

export default withNextIntl(nextConfig);