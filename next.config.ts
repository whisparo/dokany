import { execSync } from 'child_process';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**', 
        port: '',
        pathname: '**',
      },
    ],
  },

  // 🚀 استخدام any هنا بيحل مشكلة الـ Webpack Types تماماً ومن غير أخطاء
  webpack: (config: any, { dev, isServer }: { dev: boolean; isServer: boolean }) => {
    if (!dev && isServer) {
      config.plugins?.push({
        apply: (compiler: any) => {
          compiler.hooks.afterEmit.tap('RunScriptsAfterBuild', () => {
            console.log('⚡ [Next.js Build Finished] Running execution scripts...');
            try {
              execSync('node scripts/add-routes.js', { stdio: 'inherit' });
              execSync('node scripts/rename-worker.js', { stdio: 'inherit' });
              console.log('🎯 All scripts executed successfully!');
            } catch (error) {
              console.error('❌ Failed to execute scripts:', error);
            }
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;