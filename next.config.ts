// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // reactCompiler: true,
  },
  images: {
    domains: [],
  },
};

export default nextConfig;