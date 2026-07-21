'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Checkout } from '@/components/storefront/Checkout';

// ✅ مطلوب للـ static export
export const dynamicParams = false;

export function generateStaticParams() {
  return [];
}

export default function CheckoutPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeSlug = params.storeSlug as string;
  const shipping = searchParams.get('shipping') || 'standard';
  const currency = searchParams.get('currency') || 'EGP';

  const [rawData, setRawData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/store/${storeSlug}/checkout?shipping=${shipping}&currency=${currency}`)
      .then(res => res.json())
      .then(data => {
        setRawData(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [storeSlug, shipping, currency]);

  if (loading) return <div>جاري التحميل...</div>;
  if (!rawData) return <div>السلة فارغة</div>;

  return (
    <div className="min-h-screen bg-muted/30 py-8 md:py-16">
      <Checkout rawData={rawData} />
    </div>
  );
}