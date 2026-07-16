// src/app/(storefront)/[storeSlug]/products/[slug]/page.tsx

import { notFound } from 'next/navigation';
import { ProductDetailsOrchestrator } from '@/lib/orchestrators/product-details-orchestrator';
import { ProductDetails } from '@/components/storefront/ProductDetails';
export const runtime = 'edge';

interface ProductPageProps {
  params: Promise<{
    storeSlug: string;
    slug: string;
  }>;
  searchParams: Promise<{
    currency?: string; // لقط العملة من الـ URL أو الـ Query params لو وجدت
  }>;
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  // 1. فك الـ Promises الخاصة بالـ params و الـ searchParams (توافقاً مع Next.js 15+)
  const { storeSlug, slug } = await params;
  const { currency } = await searchParams;

  // 💡 تحديد العملة المفضلة بشكل مرن (Query param -> أو الإفتراضية EGP)
  const userCurrency = currency || 'EGP';

  // 2. طلب الـ Payload المجهز بالكامل من الأوركسترا بضربة واحدة 🎯
  const payload = await ProductDetailsOrchestrator.fetchDetailPagePayload(
    storeSlug,
    slug,
    userCurrency
  );

  // 3. حارس البوابة: لو الداتا مش موجودة ارمي 404 نظيفة فوراً
  if (!payload) {
    return notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/20 pb-16" dir="rtl">
      {/* 4. الهيكل الخارجي الفخم وتمرير البيانات المصفاة للـ UI Component */}
      <div className="max-w-7xl mx-auto px-4 mt-8">
        <ProductDetails data={payload.productDetails} />
      </div>
    </div>
  );
}