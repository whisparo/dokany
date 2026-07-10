// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: "standalone", // ✅ هذا السطر هو الحل
  experimental: {
    // reactCompiler: true,
  },
  images: {
    domains: [],
  },
};

export default nextConfig;