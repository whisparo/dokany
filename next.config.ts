import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import withBundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin();

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // ❌ تم إزالة output: 'standalone' لمنع التعارض مع @opennextjs/cloudflare

  // 1. تفعيل الضغط التلقائي للـ Output (Gzip / Brotli)
  compress: true,

  // 2. إدارة العناوين الهيكلية (HTTP Cache Control) للـ Static Assets والـ HTML
  async headers() {
    return [
      // ⚡ كاش أبدي لملفات الـ Build المرفقة بـ Hashes (JS & CSS)
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // ⚡ قاعدة شاملة تغطي أي مسار (عربي مشفر %D8، إنجليزي، أو أي لغة)
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=60, stale-while-revalidate=3600',
          },
        ],
      },
    ];
  },

  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },

  // ⚡ Tree-shaking وتحسين استيراد المكتبات الثقيلة لتقليل حجم الـ Chunks
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
    ],
  },
};

export default bundleAnalyzer(withNextIntl(nextConfig));