// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ❌ **لا** تضع output: "export" هنا
  // لأنك تحتاج API Routes و SSR تعمل على Cloudflare Pages Functions

  experimental: {
    // reactCompiler: true, // علّقها إذا مش محتاجها
  },

  images: {
    domains: [], // ضع domains الخاصة بك هنا
  },
};

export default nextConfig;