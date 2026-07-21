// app/(storefront)/[storeSlug]/checkout/page.tsx

import { notFound } from 'next/navigation';
import { Checkout } from '@/components/storefront/Checkout';
import { getCheckoutRawData, getSessionId } from '@/lib/data/checkout-data-fetcher';
import { getStoreRawData } from '@/lib/data/store-data-fetcher';
import { handleCheckoutSubmit } from './checkout.actions';
import type { Metadata } from 'next';

// ✅ إعدادات static export
export const dynamic = 'force-static';
export const dynamicParams = false;

/**
 * 🛠️ دالة الـ SSG - ترجع مصفوفة فارغة لتخطي التوليد المسبق
 */
export async function generateStaticParams() {
  return [];
}

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
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ shipping?: string; currency?: string }>;
}) {
  const { storeSlug } = await params;
  
  const storeRaw = await getStoreRawData(storeSlug, { page: 1, limit: 1 });
  if (!storeRaw) notFound();

  const sessionId = await getSessionId();
  const rawData = await getCheckoutRawData(storeRaw.store.id, undefined, sessionId);

  if (!rawData || !rawData.cartItems || rawData.cartItems.length === 0) {
    notFound();
  }

  const boundSubmitAction = handleCheckoutSubmit.bind(null, storeSlug);

  return (
    <div className="min-h-screen bg-muted/30 py-8 md:py-16">
      <Checkout
        rawData={rawData} 
        onSubmit={boundSubmitAction} 
      />
    </div>
  );
}