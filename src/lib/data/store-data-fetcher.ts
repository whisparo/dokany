// src/lib/data/store-data-fetcher.ts

import { unstable_cache } from 'next/cache';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { stores, products } from '@/lib/db/schema';
import type { ProductImage, ProductMetadata } from '@/lib/db/schema/products';
import type { Store, Product } from '@/types';
import type { RawStorePageData } from '@/lib/adapters/product-page.adapter';
import type { D1Database } from '@cloudflare/workers-types';

// ============================================================
// 🔌 الحصول على اتصال قاعدة البيانات
// ============================================================

/**
 * الحصول على اتصال D1 من البيئة
 * - في Cloudflare Pages: `process.env.DB` متاح كـ Binding
 * - في التطوير المحلي: يمكن استخدام `process.env.DB` أو Mock
 */
function getDb() {
  const dbBinding = process.env.DB as unknown as D1Database;

  if (!dbBinding) {
    console.error('❌ [getDb] D1 Database binding (DB) is missing from process.env');
    // في بيئة التطوير المحلي، قد لا يكون DB متاحاً، نستخدم كائن وهمي
    // لكن في الإنتاج، هذا لن يحدث لأن Pages توفر الـ Binding
    throw new Error('D1 Database binding not available');
  }

  return drizzle(dbBinding);
}

// ============================================================
// 🗄️ دوال جلب البيانات الفعلية
// ============================================================

async function fetchStoreInfo(storeSlug: string): Promise<Store | null> {
  const decodedSlug = decodeURIComponent(storeSlug);
  const db = getDb();

  const rawStore = await db
    .select()
    .from(stores)
    .where(eq(stores.slug, decodedSlug))
    .get();

  if (!rawStore) return null;

  let storeTheme = undefined;
  if (rawStore.theme) {
    try {
      storeTheme = typeof rawStore.theme === 'string'
        ? JSON.parse(rawStore.theme)
        : rawStore.theme;
    } catch (e) {
      console.error('❌ Failed to parse store theme JSON:', e);
    }
  }

  let storeSettings = undefined;
  if (rawStore.settings) {
    try {
      storeSettings = typeof rawStore.settings === 'string'
        ? JSON.parse(rawStore.settings)
        : rawStore.settings;
    } catch (e) {
      console.error('❌ Failed to parse store settings JSON:', e);
    }
  }

  const storeData: Store = {
    id: rawStore.id,
    ownerId: rawStore.ownerId,
    name: rawStore.name,
    slug: rawStore.slug,
    shopName: rawStore.shopName ?? rawStore.name,
    description: rawStore.description ?? 'أفضل المتاجر للمنتجات المميزة',
    coverImage: rawStore.coverImage ?? '/images/default-banner.png',
    logo: rawStore.logo ?? null,
    phone: rawStore.phone ?? null,
    email: rawStore.email ?? null,
    telegramChatId: rawStore.telegramChatId ?? null,
    telegramUsername: rawStore.telegramUsername ?? null,
    country: rawStore.country,
    city: rawStore.city ?? 'Cairo',
    address: rawStore.address ?? '123 Cairo St',
    currency: rawStore.currency,
    paymentGateway: rawStore.paymentGateway,

    verifiedBy: rawStore.verifiedBy ?? null,
    verifiedAt: rawStore.verifiedAt ?? null,
    deletedBy: rawStore.deletedBy ?? null,
    deletedAt: rawStore.deletedAt ?? null,
    deletionReason: rawStore.deletionReason ?? null,

    theme: storeTheme,
    settings: storeSettings ?? {
      theme: 'default',
      colors: { primary: '#11CAA0' },
      layout: [],
    },
    templateVersion: rawStore.templateVersion,
    cloudinaryAccountIndex: rawStore.cloudinaryAccountIndex ?? null,
    isActive: rawStore.isActive,
    isVerified: rawStore.isVerified,
    isFeatured: rawStore.isFeatured,
    createdAt: rawStore.createdAt,
    updatedAt: rawStore.updatedAt,
  };

  return storeData;
}

async function fetchStoreProducts(
  storeId: string,
  options?: { page?: number; limit?: number }
): Promise<{ products: Product[]; total: number }> {
  const db = getDb();
  const page = options?.page || 1;
  const limit = options?.limit || 20;
  const offset = (page - 1) * limit;

  const dbProducts = await db
    .select()
    .from(products)
    .where(eq(products.storeId, storeId))
    .limit(limit)
    .offset(offset)
    .all();

  const totalProducts = await db
    .select()
    .from(products)
    .where(eq(products.storeId, storeId))
    .all();

  const formattedProducts: Product[] = dbProducts.map((p) => {
    let imageUrls: string[] = [];
    if (p.images) {
      try {
        const parsedImages = (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) as ProductImage[];
        if (Array.isArray(parsedImages)) {
          imageUrls = parsedImages.map((img: ProductImage) => img.url);
        }
      } catch (e) {
        imageUrls = [];
      }
    }

    const mainImage = p.imageSrc || (imageUrls.length > 0 ? imageUrls[0] : '/images/default-product.png');

    return {
      id: p.id,
      storeId: p.storeId,
      categoryId: p.categoryId ?? null,
      name: p.name,
      slug: p.slug,
      description: p.description ?? '',
      shortDescription: p.shortDescription ?? '',
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,

      mediaIds: p.mediaIds,
      videoUrl: p.videoUrl ?? null,
      imageSrc: p.imageSrc ?? null,
      variantPrices: p.variantPrices ?? {},
      haggleEnabled: p.haggleEnabled,
      metadata: (p.metadata ?? {}) as ProductMetadata,

      isPublished: p.isPublished,
      isFeatured: p.isFeatured,

      price: Number(p.price) || 0,
      originalPrice: p.compareAtPrice ? Number(p.compareAtPrice) : undefined,
      cost: p.cost ? Number(p.cost) : undefined,
      minPrice: p.minPrice ? Number(p.minPrice) : undefined,

      image: mainImage,
      images: imageUrls,

      dimensions: {
        weight: p.weight ? Number(p.weight) : undefined,
        length: p.length ? Number(p.length) : undefined,
        width: p.width ? Number(p.width) : undefined,
        height: p.height ? Number(p.height) : undefined,
      },

      deletedAt: p.deletedAt ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });

  return {
    products: formattedProducts,
    total: totalProducts.length,
  };
}

async function fetchProductBySlug(
  storeId: string,
  productSlug: string
): Promise<Product | null> {
  const db = getDb();
  const decodedProductSlug = decodeURIComponent(productSlug);

  const p = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        eq(products.slug, decodedProductSlug)
      )
    )
    .get();

  if (!p) return null;

  let imageUrls: string[] = [];
  if (p.images) {
    try {
      const parsedImages = (typeof p.images === 'string' ? JSON.parse(p.images) : p.images) as ProductImage[];
      if (Array.isArray(parsedImages)) {
        imageUrls = parsedImages.map((img: ProductImage) => img.url);
      }
    } catch (e) {
      imageUrls = [];
    }
  }
  const mainImage = p.imageSrc || (imageUrls.length > 0 ? imageUrls[0] : '/images/default-product.png');

  const productData: Product = {
    id: p.id,
    storeId: p.storeId,
    categoryId: p.categoryId ?? null,
    name: p.name,
    slug: p.slug,
    description: p.description ?? '',
    shortDescription: p.shortDescription ?? '',
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,

    mediaIds: p.mediaIds,
    videoUrl: p.videoUrl ?? null,
    imageSrc: p.imageSrc ?? null,
    variantPrices: p.variantPrices ?? {},
    haggleEnabled: p.haggleEnabled,
    metadata: (p.metadata ?? {}) as ProductMetadata,

    isPublished: p.isPublished,
    isFeatured: p.isFeatured,

    price: Number(p.price) || 0,
    originalPrice: p.compareAtPrice ? Number(p.compareAtPrice) : undefined,
    cost: p.cost ? Number(p.cost) : undefined,
    minPrice: p.minPrice ? Number(p.minPrice) : undefined,

    image: mainImage,
    images: imageUrls,

    dimensions: {
      weight: p.weight ? Number(p.weight) : undefined,
      length: p.length ? Number(p.length) : undefined,
      width: p.width ? Number(p.width) : undefined,
      height: p.height ? Number(p.height) : undefined,
    },

    deletedAt: p.deletedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };

  return productData;
}

// ============================================================
// 🧠 Data Fetchers مع الـ Cache
// ============================================================

export const getStoreRawData = unstable_cache(
  async (
    storeSlug: string,
    options?: { page?: number; limit?: number }
  ): Promise<RawStorePageData | null> => {
    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new Error('Invalid storeSlug');
    }

    const store = await fetchStoreInfo(storeSlug);
    if (!store) return null;

    const { products: storeProducts, total } = await fetchStoreProducts(store.id, options);

    return {
      store,
      filteredProducts: storeProducts,
      totalCount: total,
    };
  },
  ['store-raw-data'],
  {
    revalidate: 60,
    tags: ['store-data'],
  }
);

export const getProductData = unstable_cache(
  async (storeId: string, slug: string): Promise<Product | null> => {
    if (!storeId || !slug) {
      throw new Error('[getProductData] storeId and slug are required');
    }
    return await fetchProductBySlug(storeId, slug);
  },
  [],
  {
    revalidate: 60,
    tags: ['product'],
  }
);

export const getStoreInfoData = unstable_cache(
  async (storeSlug: string): Promise<Store | null> => {
    if (!storeSlug || typeof storeSlug !== 'string') {
      throw new Error('Invalid storeSlug');
    }
    return await fetchStoreInfo(storeSlug);
  },
  ['store-info-data'],
  {
    revalidate: 60,
    tags: ['store-data'],
  }
);