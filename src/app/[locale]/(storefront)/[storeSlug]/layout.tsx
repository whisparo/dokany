// src/app/[locale]/(storefront)/[storeSlug]/layout.tsx

import React, { cache } from 'react';
import type { Metadata } from 'next';
import { Header } from '@/features/storefront-home/components/Header';
import { Footer } from '@/features/storefront-home/components/Footer';
import { StorefrontOrchestrator } from '@/features/storefront-home/orchestrators/storefront-orchestrator';
import { CartDrawerWrapper } from '@/features/storefront-home/components/CartDrawerWrapper';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

export const revalidate = 60;

// ⚡ Cached Fetcher لحفظ النتيجة في الـ Request الواحد ومحوها فور انتهائه
const getCachedPagePayload = cache(async (decodedStoreSlug: string, env: Env) => {
  return await StorefrontOrchestrator.fetchPagePayload(decodedStoreSlug, env, {});
});

// 🎯 إنشاء الـ Dynamic Metadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const fallbackDescription = 'دكاني - منصة للتسوق الإلكتروني وشراء أفضل المنتجات والفرص المميزة.';
  const fallbackTitle = 'دكاني | Dokany';

  try {
    const { env } = getCloudflareContext() as unknown as { env: Env };
    const payload = await getCachedPagePayload(decodedStoreSlug, env);

    const storeName = payload.storeInfo?.name || 'دكاني';
    const storeDescription = `تسوق أحدث المنتجات والفرص المميزة من متجر ${storeName}`;

    return {
      title: {
        default: storeName,
        template: `%s | ${storeName}`,
      },
      description: storeDescription,
      openGraph: {
        title: storeName,
        description: storeDescription,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: storeName,
        description: storeDescription,
      },
    };
  } catch (error) {
    return {
      title: {
        default: fallbackTitle,
        template: '%s | دكاني',
      },
      description: fallbackDescription,
      openGraph: {
        title: fallbackTitle,
        description: fallbackDescription,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: fallbackTitle,
        description: fallbackDescription,
      },
    };
  }
}

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const { env } = getCloudflareContext() as unknown as { env: Env };
  const payload = await getCachedPagePayload(decodedStoreSlug, env);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <Header payload={payload.header} />
      <main className="flex-1 flex flex-col w-full">{children}</main>
      <Footer payload={payload.footer} />
      <CartDrawerWrapper />
    </div>
  );
}