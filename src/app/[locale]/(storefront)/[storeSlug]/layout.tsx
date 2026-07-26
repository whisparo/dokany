// src/app/[locale]/(storefront)/[storeSlug]/layout.tsx

import React from 'react';
import { Header } from '@/components/storefront/Header';
import { Footer } from '@/components/storefront/Footer';
import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';
import { ClientCartDrawer } from '@/components/storefront/ClientCartDrawer';
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