//src/app/[locale]/(storefront)/[storeSlug]/layout.tsx
import React, { cache } from 'react';
import type { Metadata } from 'next';
import { Header } from '@/features/storefront-home/components/Header';
import { Footer } from '@/features/storefront-home/components/Footer';
import { StorefrontOrchestrator } from '@/features/storefront-home/orchestrators/storefront-orchestrator';
import { CartDrawerWrapper } from '@/features/storefront-home/components/CartDrawerWrapper';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

export const revalidate = 60;

interface StorefrontLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; storeSlug: string }>;
}

const getCachedPagePayload = cache(async (decodedStoreSlug: string, env: Env) => {
  return await StorefrontOrchestrator.fetchPagePayload(decodedStoreSlug, env, {});
});

export async function generateMetadata({ params }: StorefrontLayoutProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  try {
    const { env } = await getCloudflareContext();
    const cfEnv = env as unknown as Env;
    const payload = await getCachedPagePayload(decodedStoreSlug, cfEnv);

    return {
      title: {
        default: payload.storeInfo.name,
        template: `%s | ${payload.storeInfo.name}`,
      },
      description: `تسوق أحدث المنتجات والفرص المميزة من ${payload.storeInfo.name}`,
      openGraph: {
        title: payload.storeInfo.name,
        description: `تسوق أحدث المنتجات والفرص المميزة من ${payload.storeInfo.name}`,
        type: 'website',
      },
    };
  } catch {
    return {
      title: {
        default: 'دكاني | Dokany',
        template: '%s | دكاني',
      },
      description: 'منصة للتسوق الإلكتروني وشراء أفضل المنتجات.',
    };
  }
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const { env } = await getCloudflareContext();
  const cfEnv = env as unknown as Env;

  const payload = await getCachedPagePayload(decodedStoreSlug, cfEnv);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <Header payload={payload.header} />
      <main className="flex-1 flex flex-col w-full">{children}</main>
      <Footer payload={payload.footer} />
      <CartDrawerWrapper />
    </div>
  );
}