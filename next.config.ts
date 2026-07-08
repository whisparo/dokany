import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },

  experimental: {
    turbopackMemoryEviction: 'full',
    turbopackFileSystemCacheForBuild: true,
    turbopackRustReactCompiler: true,
    turbopackLocalPostcssConfig: true,
  },

  // منع تجميع مكتبات السيرفر مع الـ Bundle الأمامي
  serverExternalPackages: [
    '@neondatabase/serverless',
    'bcrypt-ts',
    'drizzle-orm',
    'pg',
  ],

  // تفعيل تتبع التفاصيل في logs التطوير
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // تحسينات إضافية للأمان والسرعة
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;