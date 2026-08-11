//src/app/[locale]/(storefront)/[storeSlug]/page.tsx
import { StorefrontOrchestrator } from '@/features/storefront-home/orchestrators/storefront-orchestrator';
import { Hero } from '@/features/storefront-home/components/Hero/Hero';
import { ProductGrid } from '@/components/shared/ProductGrid/ProductGrid';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

interface StorePageProps {
  params: Promise<{ locale: string; storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

export const revalidate = 60;

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const sParams = await searchParams;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const { env } = await getCloudflareContext();
  const cfEnv = env as unknown as Env;

  const payload = await StorefrontOrchestrator.fetchPagePayload(
    decodedStoreSlug, 
    cfEnv, 
    sParams
  );

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