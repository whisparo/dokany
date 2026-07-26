// src/app/[locale]/(storefront)/[storeSlug]/page.tsx

import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';
import { Hero } from '@/components/storefront/Hero/Hero';
import { ProductGrid } from '@/components/storefront/ProductGrid/ProductGrid';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

interface StorePageProps {
  // ⚡ إضافة locale إلى الـ params المتوقعة
  params: Promise<{ locale: string; storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function StorePage({ params, searchParams }: StorePageProps) {
  // ✅ استخراج locale و storeSlug مع الانتظار
  const { storeSlug, locale } = await params;
  const sParams = await searchParams;

  // ⚡ فك تشفير اسم المتجر العربي عشان الـ D1 يستوعبه صح (عطر بدلاً من %D8%B9...)
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  // ✅ الحصول على env وتحويل النوع
  const { env } = getCloudflareContext() as unknown as { env: Env };

  // ✅ تمرير الاسم المفكوك للأوركسترا
  const payload = await StorefrontOrchestrator.fetchPagePayload(decodedStoreSlug, env, sParams);

  return (
    <div className="w-full flex flex-col">
      <Hero payload={payload.hero} />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-12 pb-16">
        <ProductGrid
          data={payload.productGrid}
          storeSlug={decodedStoreSlug}
          title="منتجات المتجر"
          description="تصفح أحدث المنتجات المضافة"
        />
      </div>
    </div>
  );
}