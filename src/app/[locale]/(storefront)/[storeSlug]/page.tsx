// src/app/[locale]/(storefront)/[storeSlug]/page.tsx

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

import { getStoreRawData } from '@/features/storefront-home/data/store-data-fetcher';
import { StorePageClient } from '@/features/storefront-home/components/StorePageClient';

interface StorePageProps {
  params: Promise<{ locale: string; storeSlug: string }>;
  searchParams: Promise<{ page?: string; sort?: string; currency?: string }>;
}

export const revalidate = 60;

// 🎯 تحسين الأداء: تغليف الجلب بـ React cache لمنع الاتصال المزدوج بـ D1 بنفس الطلب
const fetchCachedStoreData = cache(
  async (decodedStoreSlug: string, env: Env, page: number) => {
    try {
      return await getStoreRawData(decodedStoreSlug, env, { page, limit: 20 });
    } catch (error) {
      console.error('[StorePage Fetch Error]:', error);
      return null;
    }
  }
);

export async function generateMetadata({ params, searchParams }: StorePageProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const sParams = await searchParams;
  const decodedStoreSlug = decodeURIComponent(storeSlug || '');

  const pageNumber = sParams.page ? parseInt(sParams.page, 10) : 1;
  const validPage = Number.isNaN(pageNumber) || pageNumber < 1 ? 1 : pageNumber;

  const fallbackTitle = decodedStoreSlug
    ? decodedStoreSlug.charAt(0).toUpperCase() + decodedStoreSlug.slice(1)
    : 'متجرنا';
  const fallbackDescription = `تسوق أحدث المنتجات والعروض المميزة حصرياً من ${fallbackTitle}.`;

  try {
    const { env } = getCloudflareContext<{ env: Env }>();
    const storeData = await fetchCachedStoreData(decodedStoreSlug, env, validPage);

    const storeName = storeData?.store?.shopName || storeData?.store?.name || fallbackTitle;
    const rawDescription = storeData?.store?.description?.trim();

    const storeDescription =
      rawDescription && rawDescription.length > 5
        ? rawDescription
        : `تسوق أحدث المنتجات والعروض المميزة حصرياً من ${storeName}.`;

    const coverImages = storeData?.store?.coverImage ? [storeData.store.coverImage] : [];

    return {
      title: storeName,
      description: storeDescription,
      openGraph: {
        title: storeName,
        description: storeDescription,
        images: coverImages,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: storeName,
        description: storeDescription,
        images: coverImages,
      },
      robots: {
        index: true,
        follow: true,
      },
    };
  } catch {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
    };
  }
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { storeSlug } = await params;
  const sParams = await searchParams;
  const decodedStoreSlug = decodeURIComponent(storeSlug);

  const pageNumber = sParams.page ? parseInt(sParams.page, 10) : 1;
  const validPage = Number.isNaN(pageNumber) || pageNumber < 1 ? 1 : pageNumber;

  const { env } = await getCloudflareContext<{ env: Env }>();
  const initialData = await fetchCachedStoreData(decodedStoreSlug, env, validPage);

  if (!initialData || !initialData.store) {
    notFound();
  }

  return (
    <StorePageClient
      storeSlug={decodedStoreSlug}
      initialData={initialData}
      page={validPage}
    />
  );
}