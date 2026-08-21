import React, { cache } from 'react';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Header } from '@/features/storefront-home/components/Header';
import { Footer } from '@/features/storefront-home/components/Footer';
import { StorefrontOrchestrator } from '@/features/storefront-home/orchestrators/storefront-orchestrator';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

// 🎨 استدعاء محرك الاستايل
import { renderStorefront } from '@/styles/storefront';

// 🎯 تحسين الأداء: تحميل CartDrawerWrapper ديناميكياً
const CartDrawerWrapper = dynamic(
  () => import('@/features/storefront-home/components/CartDrawerWrapper').then((mod) => mod.CartDrawerWrapper)
);

export const revalidate = 60;

// 🛑 المسارات الاستثنائية التي لا تمثل متجراً
const RESERVED_SLUGS = new Set(['privacy', 'terms', 'about', 'contact', 'api', 'faq']);

interface StorefrontLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; storeSlug: string }>;
}

const getCachedPagePayload = cache(async (decodedStoreSlug: string, env: Env) => {
  // 🛡️ حماية: لو الـ Slug فاضي أو ينتمي للمسارات الثابتة نلغي الطلب فوراً
  if (!decodedStoreSlug || RESERVED_SLUGS.has(decodedStoreSlug.toLowerCase())) {
    return null;
  }

  try {
    return await StorefrontOrchestrator.fetchPagePayload(decodedStoreSlug, env, {});
  } catch (error) {
    console.error('[Layout] Failed to fetch storefront payload:', error);
    return null;
  }
});

export async function generateMetadata({ params }: StorefrontLayoutProps): Promise<Metadata> {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug || '');

  // لو صفحة ثنائية مش متجر نرجع Metadata افتراضية مباشرة بدون استعلام
  if (RESERVED_SLUGS.has(decodedStoreSlug.toLowerCase())) {
    return {
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://dokany.com'),
      title: 'الشروط والسياسات',
    };
  }

  const storeName = decodedStoreSlug
    ? decodedStoreSlug.charAt(0).toUpperCase() + decodedStoreSlug.slice(1)
    : 'متجرنا';

  const defaultDescription = `تسوق أحدث المنتجات والعروض المميزة من ${storeName}.`;

  try {
    const { env } = await getCloudflareContext<{ env: Env }>();
    const payload = await getCachedPagePayload(decodedStoreSlug, env);

    const activeName = payload?.storeInfo?.name || storeName;
    const activeDescription = `تسوق أحدث المنتجات والفرص المميزة من ${activeName}.`;

    return {
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://dokany.com'),
      title: {
        default: activeName,
        template: `%s | ${activeName}`,
      },
      description: activeDescription,
      openGraph: {
        title: activeName,
        description: activeDescription,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: activeName,
        description: activeDescription,
      },
    };
  } catch {
    return {
      metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://dokany.com'),
      title: {
        default: storeName,
        template: `%s | ${storeName}`,
      },
      description: defaultDescription,
    };
  }
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { storeSlug } = await params;
  const decodedStoreSlug = decodeURIComponent(storeSlug || '');

  // 1. فحص ما إذا كان المسار صفحة ثابتة
  const isReservedRoute = RESERVED_SLUGS.has(decodedStoreSlug.toLowerCase());

  let payload = null;
  let storeThemeCSS = '';

  if (!isReservedRoute) {
    const { env } = await getCloudflareContext<{ env: Env }>();
    payload = await getCachedPagePayload(decodedStoreSlug, env);

    if (payload) {
      try {
        // 🔍 طباعة الـ payload بالكامل والـ theme المستخرج لتحديد أصل المشكلة بدقة
        console.log('[Layout Debug] Full storeInfo:', payload.storeInfo);
        console.log('[Layout Debug] Theme value:', payload.storeInfo?.theme);

        // 🎯 ضبط بيانات الـ Context
        const context = {
          storeSlug: decodedStoreSlug,
          storeInfo: payload.storeInfo,
          theme: payload.storeInfo?.theme || 'default',
        };

        storeThemeCSS = await renderStorefront(
          env as unknown as Parameters<typeof renderStorefront>[0],
          context as unknown as Parameters<typeof renderStorefront>[1]
        );
      } catch (error) {
        console.error('[Layout] Theme rendering failed:', error);
      }
    }
  }

  return (
    <>
      {/* 2. حقن الـ CSS Variables */}
      {storeThemeCSS && (
        <style
          id="storefront-theme-style"
          dangerouslySetInnerHTML={{ __html: storeThemeCSS }}
        />
      )}

      <div className="min-h-screen flex flex-col bg-store-background text-store-text">
        {payload && <Header payload={payload.header} />}
        <main className="flex-1 flex flex-col w-full">{children}</main>
        {payload && <Footer payload={payload.footer} />}
        <CartDrawerWrapper />
      </div>
    </>
  );
}