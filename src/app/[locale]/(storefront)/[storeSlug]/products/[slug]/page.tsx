//src/app/[locale]/(storefront)/[storeSlug]/products/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { ProductDetailsOrchestrator } from '@/features/storefront-product/orchestrators/product-details-orchestrator';
import { ProductDetails } from '@/features/storefront-product/components/ProductDetails';
import { RelatedProducts } from '@/features/storefront-product/components/RelatedProducts';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Metadata } from 'next';
import type { Env } from '@/lib/env';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ locale: string; storeSlug: string; slug: string }>;
  searchParams: Promise<{ currency?: string }>;
}

// ============================================================
// 🏷️ Metadata ديناميكي للـ SEO
// ============================================================
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  try {
    const { storeSlug, slug } = await params;
    const decodedStoreSlug = decodeURIComponent(storeSlug);
    const decodedProductSlug = decodeURIComponent(slug);

    // 🌍 جلب env مع await (تصحيح الخطأ الحرج)
    const { env } = await getCloudflareContext();
    const cfEnv = env as unknown as Env;

    if (!cfEnv?.DB) {
      return { title: 'منتج | دكاني' };
    }

    // 📦 جلب بيانات المنتج للـ SEO
    const payload = await ProductDetailsOrchestrator.fetchDetailPagePayload(
      decodedStoreSlug,
      decodedProductSlug,
      'EGP',
      cfEnv
    );

    if (!payload) {
      return { title: 'المنتج غير موجود | دكاني' };
    }

    const { productDetails, store } = payload;
    const mainImageUrl = productDetails.mainMedia?.url || store.coverImage || '';

    return {
      title: `${productDetails.name} | ${store.name}`,
      description: productDetails.description?.slice(0, 160) || `اشتري ${productDetails.name} من ${store.name}`,
      openGraph: {
        title: productDetails.name,
        description: productDetails.description?.slice(0, 160),
        type: 'website',
        images: mainImageUrl ? [{ url: mainImageUrl, width: 1200, height: 630 }] : [],
      },
      alternates: {
        canonical: `/${decodedStoreSlug}/products/${decodedProductSlug}`,
      },
    };
  } catch (error) {
    console.error('[ProductPage] Metadata generation failed:', error);
    return { title: 'منتج | دكاني' };
  }
}

// ============================================================
// 🎨 الصفحة الرئيسية
// ============================================================
export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { storeSlug, slug } = await params;
  const sParams = await searchParams;

  const decodedStoreSlug = decodeURIComponent(storeSlug);
  const decodedProductSlug = decodeURIComponent(slug);

  // ⚡ جلب env بأمان
  const context = await getCloudflareContext();
  const env = context.env as unknown as Env;

  // 🛡️ حارس الأمان
  if (!env?.DB) {
    console.error('❌ D1 Database binding not available in ProductPage');
    notFound();
  }

  // 📦 جلب الـ Payload مع تمرير env
  const payload = await ProductDetailsOrchestrator.fetchDetailPagePayload(
    decodedStoreSlug,
    decodedProductSlug,
    sParams.currency || 'EGP',
    env
  );

  if (!payload) notFound();

  return (
    <div className="w-full flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-8 pb-16">
        <ProductDetails data={payload.productDetails} />
        
        {payload.relatedProducts && payload.relatedProducts.length > 0 && (
          <div className="mt-16 border-t border-slate-100 dark:border-slate-800 pt-12">
            <h2 className="text-2xl font-bold mb-6 text-right">منتجات قد تعجبك أيضاً</h2>
            <RelatedProducts 
              products={payload.relatedProducts} 
              storeSlug={decodedStoreSlug} 
            />
          </div>
        )}
      </div>
    </div>
  );
}