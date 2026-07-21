// src/app/(storefront)/[storeSlug]/page.tsx

import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';
import { Hero } from '@/components/storefront/Hero/Hero';
import { ProductGrid } from '@/components/storefront/ProductGrid/ProductGrid';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

// 🎯 السماح للمتجر الديناميكي بالعمل وقت الطلب
export const dynamicParams = true;

/**
 * 🛠️ دالة الـ SSG لإرضاء شروط Static Export وقت الـ Build
 */
export async function generateStaticParams() {
  return [];
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const sParams = await searchParams;

  const payload = await StorefrontOrchestrator.fetchPagePayload(storeSlug, sParams);

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