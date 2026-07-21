// src/app/(storefront)/[storeSlug]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Hero } from '@/components/storefront/Hero/Hero';
import { ProductGrid } from '@/components/storefront/ProductGrid/ProductGrid';

export default function StorePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeSlug = params.storeSlug as string;
  const page = searchParams.get('page') || '1';
  const sort = searchParams.get('sort') || 'newest';
  const currency = searchParams.get('currency') || 'EGP';

  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/store/${storeSlug}?page=${page}&sort=${sort}&currency=${currency}`)
      .then(res => res.json())
      .then(data => {
        setPayload(data.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [storeSlug, page, sort, currency]);

  if (loading) return <div>جاري التحميل...</div>;
  if (!payload) return <div>المتجر غير موجود</div>;

  return (
    <div className="w-full flex flex-col">
      <Hero payload={payload.hero} />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-12 pb-16">
        <ProductGrid
          data={payload.productGrid}
          storeSlug={storeSlug}
          title="منتجات المتجر"
          description="تصفح أحدث المنتجات المضافة"
        />
      </div>
    </div>
  );
}