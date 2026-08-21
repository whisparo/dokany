// src/features/storefront-home/components/StorePageClient.tsx

'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useStoreSnapshot } from '@/lib/cache/useStoreSnapshot';
import { Hero } from './Hero';
import { adaptHero } from './Hero/Hero.adapter';
import { adaptProductGrid } from '@/components/shared/ProductGrid/ProductGrid.adapter';
import type { RawStorePageData } from '@/features/storefront-home/adapters/product-page.adapter';

// 🎯 1. Dynamic Import للـ ProductGrid لتخفيف الـ Main Thread وتقليل وقت الـ Script Evaluation
const ProductGrid = dynamic(
  () => import('@/components/shared/ProductGrid').then((mod) => mod.ProductGrid),
  {
    loading: () => <ProductGridSkeleton />,
    ssr: true,
  }
);

interface StorePageClientProps {
  storeSlug: string;
  initialData: RawStorePageData | null;
  page: number;
}

export function StorePageClient({ storeSlug, initialData, page }: StorePageClientProps) {
  // 🎯 1. تشغيل الـ Snapshot دائماً لربط الـ Cache / IndexedDB وتلقي التحديثات في الخلفية
  const { snapshot, loading, error } = useStoreSnapshot(storeSlug);

  // 🎯 2. دمج البيانات: نفضل الـ Snapshot الحديث أولاً، ثم الـ initialData المباشرة من الـ SSR
  const rawSnapshotData = snapshot?.data as RawStorePageData | undefined;
  const data: RawStorePageData | null = rawSnapshotData ?? initialData ?? null;

  // 🎯 3. حساب التكيفات (Adapters)
  const heroPayload = useMemo(() => {
    if (!data?.store || !data.store.name || !data.store.slug) return null;
    return adaptHero(data.store);
  }, [data?.store]);

  const gridData = useMemo(() => {
    if (!data?.store) return null;
    const productsList = data.filteredProducts || [];

    return adaptProductGrid(
      productsList,
      data.store.currency || 'EGP',
      {
        page,
        limit: 20,
        totalCountFromDB: data.totalCount ?? productsList.length,
      }
    );
  }, [data, page]);

  // 🎯 4. حالة التحميل تظهر فقط لو مفيش initialData ومفيش Snapshot لسه
  if (loading && !data) {
    return <StorePageSkeleton />;
  }

  // باقي الكود زي ما هو تماماً...

  if (error && !data) {
    return (
      <div className="text-center py-20">
        <div className="max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-500 mb-2">
            حدث خطأ أثناء تحميل المتجر
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error.message || 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى'}
          </p>
          <button
            type="button"
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            onClick={() => window.location.reload()}
          >
            🔄 إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!data || !data.store || !heroPayload || !gridData) {
    return (
      <div className="text-center py-20">
        <div className="max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">🏪</div>
          <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-2">
            المتجر غير موجود
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            عذراً، لم نتمكن من العثور على هذا المتجر أو أنه مغلق حالياً
          </p>
        </div>
      </div>
    );
  }

  // 6️⃣ عرض الواجهة الرئيسية
  return (
    <>
      <Hero payload={heroPayload} />

      <div className="container mx-auto px-4 py-8">
        <ProductGrid
          data={gridData}
          storeSlug={storeSlug}
          columns={4}
          showAddToCart
          showRating
        />
      </div>
    </>
  );
}

// 💠 Skeletons محلية سريعة
function StorePageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[50vh] w-full bg-gray-200 dark:bg-gray-800 rounded-b-3xl" />
      <ProductGridSkeleton />
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 animate-pulse">
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-24 bg-gray-200 dark:bg-gray-800 rounded-full flex-shrink-0"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-2xl"
          />
        ))}
      </div>
    </div>
  );
}