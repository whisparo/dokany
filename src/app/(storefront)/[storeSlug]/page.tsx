// src/app/(storefront)/[storeSlug]/page.tsx

import { StorefrontOrchestrator } from '@/lib/orchestrators/storefront-orchestrator';
import { Hero } from '@/components/storefront/Hero/Hero';
import { ProductGrid } from '@/components/storefront/ProductGrid/ProductGrid';

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const sParams = await searchParams;

  // 🎛️ نداء الأوركسترا مباشرة بسطر واحد فاخر
  const payload = await StorefrontOrchestrator.fetchPagePayload(storeSlug, sParams);

  return (
    <div className="w-full flex flex-col">
      
      {/* 1. الهيرو واخد راحته وعرض الشاشة كاملة وبيلزق تلقائي بفضل الـ Layout الخارجي */}
      <Hero payload={payload.hero} />
      
      {/* 2. حاوية الجريد محبوسة في صندوقها الـ 7xl المستقل بمسافة رأسية فخمة */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-12 pb-16">
        <ProductGrid 
          data={payload.productGrid} 
          title="منتجات المتجر"
          description="تصفح أحدث المنتجات المضافة"
        />
      </div>

    </div>
  );
}