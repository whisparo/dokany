// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ❌ أشيل الخيارات التجريبية غير الصالحة
  experimental: {
    // لو عايز React Compiler، هتحتاج تثبت babel-plugin-react-compiler
    // reactCompiler: true, // علقها أو أشيلها لو مش محتاجها
  },
  
  // ✅ خيارات آمنة ومدعومة
  turbopack: {
    // لو عايز تحدد إعدادات Turbopack، استخدم الكيان ده
    // لكن المشكلة كانت في experimental، مش هنا
  },

  // باقي إعداداتك...
  images: {
    domains: [], // مثلاً
  },
};

export default nextConfig;