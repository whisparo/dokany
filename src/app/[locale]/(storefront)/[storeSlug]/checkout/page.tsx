// src/app/[locale]/(storefront)/[storeSlug]/checkout/page.tsx

import { notFound } from 'next/navigation';
import { Checkout } from '@/features/storefront-checkout/components/Checkout';

import { getCheckoutRawData, getSessionId } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';
import { handleCheckoutSubmit, type CheckoutFormSubmission } from '@/features/storefront-checkout/actions/checkout.actions';

import type { Metadata } from 'next';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  const decodedSlug = decodeURIComponent(storeSlug);
  
  return {
    title: `الدفع | ${decodedSlug} | دكاني`,
    description: 'إتمام عملية الدفع والتوصيل الفوري',
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string; storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  
  // ✅ فك تشفير الـ slug لدعم الأسماء العربية
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  // ✅ جلب الـ Context بأمان عبر await
  const { env } = await getCloudflareContext();
  const cfEnv = env as unknown as Env;

  if (!cfEnv?.DB) {
    console.error('❌ D1 Database binding not available in CheckoutPage');
    notFound();
  }

  // 🏪 جلب بيانات المتجر
  // ✅ تمرير cfEnv كـ argument ثاني + options كـ argument تالت
  const storeRaw = await getStoreRawData(decodedStoreSlug, cfEnv, { page: 1, limit: 1 });
  if (!storeRaw) notFound();

  const storeId = storeRaw.store.id;
  const sessionId = await getSessionId();
  
  // 🛒 جلب بيانات الدفع
  const rawData = await getCheckoutRawData(storeId, cfEnv, undefined, sessionId);
  
  // ✅ حماية من null
  if (!rawData) {
    notFound();
  }

  // ⚡ دالة التغليف لتكييف الأنواع بين المكون والـ Server Action
  const handleSubmitWrapper = async (
    data: Parameters<NonNullable<React.ComponentProps<typeof Checkout>['onSubmit']>>[0]
  ): Promise<void> => {
    const payload: CheckoutFormSubmission = {
      customer: data.customer,
      shippingAddress: data.shippingAddress as any,
      items: data.items,
      shippingCost: data.shippingCost,
      paymentMethod: data.paymentMethod,
      shippingMethod: data.shippingMethod,
      currency: data.currency,
    };

    const result = await handleCheckoutSubmit(decodedStoreSlug, storeId, payload);
    
    if (!result.success) {
      throw new Error(result.error || 'حدث خطأ أثناء إتمام الطلب');
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 py-8 md:py-16">
      <Checkout rawData={rawData} onSubmit={handleSubmitWrapper} />
    </div>
  );
}