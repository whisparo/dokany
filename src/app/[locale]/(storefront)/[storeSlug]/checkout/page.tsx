// app/(storefront)/[storeSlug]/checkout/page.tsx

import { notFound } from 'next/navigation';
import { Checkout } from '@/features/storefront-checkout/components/Checkout';

// ✅ استيراد الـ Fetcher والـ Action
import { getCheckoutRawData, getSessionId } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';
import { handleCheckoutSubmit, type CheckoutFormSubmission } from '@/features/storefront-checkout/actions/checkout.actions';

import type { Metadata } from 'next';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}): Promise<Metadata> {
  const { storeSlug } = await params;
  return {
    title: `الدفع | ${storeSlug} | دكاني`,
    description: 'إتمام عملية الدفع والتوصيل الفوري',
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;

  // ⚡ جلب الـ Context بأمان عبر await وتأكيد النوع
  const context = await getCloudflareContext();
  const env = context.env as unknown as Env;

  if (!env?.DB) {
    console.error('❌ D1 Database binding not available in CheckoutPage');
    notFound();
  }

  // 🏪 جلب بيانات المتجر وبيانات الدفع
  const storeRaw = await getStoreRawData(storeSlug, env, { page: 1, limit: 1 });
  if (!storeRaw) notFound();

  const storeId = storeRaw.store.id;
  const sessionId = await getSessionId();
  const rawData = await getCheckoutRawData(storeId, env, undefined, sessionId);

  // 💡 تم إزالة فحص cartItems من السيرفر لمنع الـ Infinite Loop 
  // الفحص سيتم داخل مكون <Checkout /> في الـ Client-side عبر Zustand store.

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

    const result = await handleCheckoutSubmit(storeSlug, storeId, payload);
    
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