import { notFound } from 'next/navigation';
import { Checkout } from '@/features/storefront-checkout/components/Checkout'; // أو المسار الجديد في features/checkout/components/Checkout

// ✅ استيراد البيانات من المسارات الجديدة الاحترافية داخل src/features/
import { getCheckoutRawData, getSessionId } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';

import { handleCheckoutSubmit } from '../../../../../features/storefront-checkout/actions/checkout.actions';
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
  searchParams: Promise<{ shipping?: string; currency?: string }>;
}) {
  const { storeSlug } = await params;

  // ✅ الحصول على env من سياق OpenNext
  const { env } = getCloudflareContext() as unknown as { env: Env };

  if (!env?.DB) {
    console.error('❌ D1 Database binding not available in CheckoutPage');
    notFound();
  }

  const storeRaw = await getStoreRawData(storeSlug, env, { page: 1, limit: 1 });
  if (!storeRaw) notFound();

  const sessionId = await getSessionId();
  const rawData = await getCheckoutRawData(storeRaw.store.id, env, undefined, sessionId);

  if (!rawData || !rawData.cartItems || rawData.cartItems.length === 0) {
    notFound();
  }

  const boundSubmitAction = handleCheckoutSubmit.bind(null, storeSlug);

  return (
    <div className="min-h-screen bg-muted/30 py-8 md:py-16">
      <Checkout rawData={rawData} onSubmit={boundSubmitAction} />
    </div>
  );
}