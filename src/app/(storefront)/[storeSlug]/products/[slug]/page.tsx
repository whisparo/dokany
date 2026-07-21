// src/app/(storefront)/[storeSlug]/products/[slug]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ProductDetails } from '@/components/storefront/ProductDetails';

export default function ProductPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeSlug = params.storeSlug as string;
  const slug = params.slug as string;
  const currency = searchParams.get('currency') || 'EGP';

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/store/${storeSlug}/products/${slug}?currency=${currency}`)
      .then(res => res.json())
      .then(data => {
        setProduct(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [storeSlug, slug, currency]);

  if (loading) return <div>جاري التحميل...</div>;
  if (!product) return <div>المنتج غير موجود</div>;

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/20 pb-16" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 mt-8">
        <ProductDetails data={product} />
      </div>
    </div>
  );
}