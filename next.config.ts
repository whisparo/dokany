// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 🔥 ده هيساعد OpenNext يشتغل مع Next.js 16
  output: "standalone", // إضافي لو لسه في مشاكل

  experimental: {
    // reactCompiler: true, // علّقها إذا مش محتاجها
  },

  images: {
    domains: [], // ضع domains الخاصة بك هنا
  },
};

export default nextConfig;