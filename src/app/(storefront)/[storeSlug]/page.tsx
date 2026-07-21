// src/app/(storefront)/[storeSlug]/page.tsx

import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';
import { Hero } from '@/components/storefront/Hero/Hero';
import { ProductGrid } from '@/components/storefront/ProductGrid/ProductGrid';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

// ✅ إعدادات static export
export const dynamic = 'force-static';
export const dynamicParams = false;

/**
 * 🛠️ دالة الـ SSG - ترجع مصفوفة فارغة لتخطي التوليد المسبق
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