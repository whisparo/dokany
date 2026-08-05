// src/app/[locale]/(storefront)/[storeSlug]/layout.tsx

import React from 'react';
import { Header } from '@/features/storefront-home/components/Header';
import { Footer } from '@/features/storefront-home/components/Footer';
import { StorefrontOrchestrator } from '@/features/storefront-home/orchestrators/storefront-orchestrator';
import { ClientCartDrawer } from '@/features/storefront-home/components/ClientCartDrawer';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

export const revalidate = 60; 

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; storeSlug: string }>;
}) {
  const { storeSlug, locale } = await params;

  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const { env } = getCloudflareContext() as unknown as { env: Env };

  const payload = await StorefrontOrchestrator.fetchPagePayload(decodedStoreSlug, env, {});

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <Header payload={payload.header} />
      <main className="flex-1 flex flex-col w-full">{children}</main>
      <Footer payload={payload.footer} />
      {/* 🛒 السلة هتحمل على الكلاينت فقط وبدون أي تعارض مع الـ Build */}
      <ClientCartDrawer />
    </div>
  );
}