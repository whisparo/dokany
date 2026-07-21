// src/app/(storefront)/[storeSlug]/products/[slug]/page.tsx

import { notFound } from 'next/navigation';
import { ProductDetailsOrchestrator } from '@/lib/orchestrators/product-details-orchestrator';
import { ProductDetails } from '@/components/storefront/ProductDetails';

interface ProductPageProps {
  params: Promise<{
    storeSlug: string;
    slug: string;
  }>;
  searchParams: Promise<{
    currency?: string;
  }>;
}

// 🎯 السماح للمسارات الديناميكية بالعمل وقت الطلب (On-demand)
export const dynamicParams = true;

/**
 * 🛠️ دالة الـ SSG المضافة لحل خطأ "output: export"
 * ترجع مصفوفة فارغة لتخطي التوليد المسبق الثابت وترك جلب البيانات ديناميكياً
 */
export async function generateStaticParams() {
  return [];
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  // 1. فك الـ Promises الخاصة بالـ params والـ searchParams (Next.js 15+)
  const { storeSlug, slug } = await params;
  const { currency } = await searchParams;

  // 💡 تحديد العملة المفضلة بشكل مرن (Query param -> أو الافتراضية EGP)
  const userCurrency = currency || 'EGP';

  // 2. طلب الـ Payload المجهز بالكامل من الأوركسترا
  const payload = await ProductDetailsOrchestrator.fetchDetailPagePayload(
    storeSlug,
    slug,
    userCurrency
  );

  // 3. حارس البوابة: لو البيانات غير موجودة ارمي 404 نظيفة
  if (!payload) {
    return notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/20 pb-16" dir="rtl">
      {/* 4. الهيكل الخارجي وتمرير البيانات للـ UI Component */}
      <div className="max-w-7xl mx-auto px-4 mt-8">
        <ProductDetails data={payload.productDetails} />
      </div>
    </div>
  );
}