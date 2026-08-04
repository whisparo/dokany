// app/(storefront)/[storeSlug]/page.tsx

import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';
import { Hero } from '@/features/storefront-home/components/Hero/Hero';
import { ProductGrid } from '@/components/storefront/ProductGrid/ProductGrid';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const sParams = await searchParams;

  // ✅ الحصول على env وتحويل النوع
  const { env } = getCloudflareContext() as unknown as { env: Env };

  const payload = await StorefrontOrchestrator.fetchPagePayload(storeSlug, env, sParams);

  return (
    <div className="w-full flex flex-col">
      <Hero payload={payload.hero} />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-12 pb-16">
        <ProductGrid
          data={payload.productGrid}
          storeSlug={storeSlug}
          title="منتجات المتجر"
          description="تصفح أحدث المنتجات المضافة"
        />
      </div>
    </div>
  );
}