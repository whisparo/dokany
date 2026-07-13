// src/app/(storefront)/[storeSlug]/layout.tsx
import React from 'react';
import { Header } from '@/components/storefront/Header';
import { Footer } from '@/components/storefront/Footer';
import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';

export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const payload = await StorefrontOrchestrator.fetchPagePayload(storeSlug);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950">
      <Header payload={payload.header} />
      {/* رجعناه طبيعي flex-1 وبدون أي margin علوي قاطع */}
      <main className="flex-1 flex flex-col w-full">
        {children}
      </main>
      <Footer payload={payload.footer} />
    </div>
  );
}