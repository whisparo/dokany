import React, { cache } from 'react';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Header } from '@/features/storefront-home/components/Header';
import { Footer } from '@/features/storefront-home/components/Footer';
import { StorefrontOrchestrator } from '@/features/storefront-home/orchestrators/storefront-orchestrator';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

// 🎯 تحسين الأداء: تحميل CartDrawerWrapper ديناميكياً بدعم SSR لتوافق Server Components
const CartDrawerWrapper = dynamic(
  () => import('@/features/storefront-home/components/CartDrawerWrapper').then((mod) => mod.CartDrawerWrapper)
);

export const revalidate = 60;

interface StorefrontLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; storeSlug: string }>;
}

const getCachedPagePayload = cache(async (decodedStoreSlug: string, env: Env) => {
  try {
    return await StorefrontOrchestrator.fetchPagePayload(decodedStoreSlug, env, {});
  } catch (error) {
    console.error('[Layout] Failed to fetch storefront payload:', error);
    return null;
  }
});

export async function generateMetadata({ params }: StorefrontLayoutProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug || '');

  const storeName = decodedStoreSlug
    ? decodedStoreSlug.charAt(0).toUpperCase() + decodedStoreSlug.slice(1)
    : 'متجرنا';

  const defaultDescription = `تسوق أحدث المنتجات والعروض المميزة من ${storeName}.`;

  try {
    const { env } = await getCloudflareContext<{ env: Env }>();
    const payload = await getCachedPagePayload(decodedStoreSlug, env);

    const activeName = payload?.storeInfo?.name || storeName;
    const activeDescription = `تسوق أحدث المنتجات والفرص المميزة من ${activeName}.`;

    return {
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://dokany.com'),
      title: {
        default: activeName,
        template: `%s | ${activeName}`,
      },
      description: activeDescription,
      openGraph: {
        title: activeName,
        description: activeDescription,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: activeName,
        description: activeDescription,
      },
    };
  } catch {
    return {
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://dokany.com'),
      title: {
        default: storeName,
        template: `%s | ${storeName}`,
      },
      description: defaultDescription,
    };
  }
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const { env } = await getCloudflareContext<{ env: Env }>();

  const payload = await getCachedPagePayload(decodedStoreSlug, env);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
      {payload && <Header payload={payload.header} />}
      <main className="flex-1 flex flex-col w-full">{children}</main>
      {payload && <Footer payload={payload.footer} />}
      <CartDrawerWrapper />
    </div>
  );
}