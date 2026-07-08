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
    // 💡 بنسيب الـ Rust React Compiler لأنه ممتاز وسريع جداً
    turbopackRustReactCompiler: true,
    
    // ⚠️ نصيحة: لو الـ Build الجاي اشتكى، هنوقف الـ Turbopack Features دي مؤقتاً أثناء الـ Build 
    // لأن OpenNext يعتمد على الـ Webpack build output القياسي لعمل الـ Tracing.
    turbopackMemoryEviction: 'full',
    turbopackFileSystemCacheForBuild: true,
    turbopackLocalPostcssConfig: true,
  },

  // منع تجميع مكتبات السيرفر مع الـ Bundle الأمامي (ممتاز جداً للـ Edge والـ Multi-tenancy)
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