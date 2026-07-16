// app/(storefront)/[storeSlug]/checkout/page.tsx

import { notFound, redirect } from 'next/navigation';
import { Checkout } from '@/components/storefront/Checkout';
import { getCheckoutRawData, getSessionId } from '@/lib/data/checkout-data-fetcher'; // 👈 استوردنا getSessionId
import { getStoreRawData } from '@/lib/data/store-data-fetcher';
import type { Metadata } from 'next';

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

async function handleCheckoutSubmit(
  storeSlug: string,
  data: {
    customer: any;
    shippingId: string;
    paymentId: string;
  }
) {
  'use server';
  console.log('[Server Action] Order submitted successfully:', data);
  redirect(`/${storeSlug}/order-confirmation`);
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ shipping?: string; currency?: string }>;
}) {
  const { storeSlug } = await params;
  
  // 1. التأكد من وجود المتجر وجلب بياناته الأساسية
  const storeRaw = await getStoreRawData(storeSlug, { page: 1, limit: 1 });
  if (!storeRaw) notFound();

  // ✅ 2. جلب الـ Session ID الفعلي للعميل من الـ cookies لجلب سلته بشكل صحيح
  const sessionId = await getSessionId();

  // ✅ 3. تمرير الـ sessionId للـ Fetcher عشان ميرجعش سلة فاضية ويطردنا
  const rawData = await getCheckoutRawData(storeRaw.store.id, undefined, sessionId);

  // إذا كانت السلة فارغة أو مفيش منتجات، ارجع فوراً للمتجر
  if (!rawData || !rawData.cartItems || rawData.cartItems.length === 0) {
    redirect(`/${storeSlug}`);
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