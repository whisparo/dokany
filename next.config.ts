// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  

  experimental: {
    // reactCompiler: true, // علّقها إذا مش محتاجها
  },

  images: {
    domains: [], // أو أضف domains الخاصة بك
  },
};

export default nextConfig;