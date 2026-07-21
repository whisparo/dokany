// app/(storefront)/[storeSlug]/products/[slug]/page.tsx

import { notFound } from 'next/navigation';
import { ProductDetailsOrchestrator } from '@/lib/orchestrators/product-details-orchestrator';
import { ProductDetails } from '@/components/storefront/ProductDetails';

interface ProductPageProps {
  params: Promise<{ storeSlug: string; slug: string }>;
  searchParams: Promise<{ currency?: string }>;
}

// ✅ مع OpenNext، نستخدم SSR (Dynamic) بدون generateStaticParams
export const dynamic = 'force-dynamic';

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { storeSlug, slug } = await params;
  const { currency } = await searchParams;

  const userCurrency = currency || 'EGP';
  const payload = await ProductDetailsOrchestrator.fetchDetailPagePayload(
    storeSlug,
    slug,
    userCurrency
  );

  if (!payload) {
    return notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/20 pb-16" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 mt-8">
        <ProductDetails data={payload.productDetails} />
      </div>
    </div>
  );
}