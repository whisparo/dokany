// src/dashboard/products-management/server/product.helpers.ts

import { randomUUID } from 'crypto';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { getAppDb } from '@/lib/db/db';
import { products, type NewProduct, type Product } from '@/lib/db/schema/products';
import { stores } from '@/lib/db/schema/stores';
import { SystemError } from '@/lib/errors';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { revalidateTag } from 'next/cache';
import type { Env } from '@/lib/env';
import type { KVNamespace } from '@cloudflare/workers-types';
import type { CreateProductInput, UpdateProductInput } from '@/lib/validations/product';

type AppDb = Awaited<ReturnType<typeof getAppDb>>['db'];

// ============================================================
// 📦 دوال مساعدة خاصة بالمنتجات (Pure Utility Functions)
// ============================================================

function formatDimension(value?: number | null): string | null {
  if (value === undefined || value === null) return null;
  return value.toString();
}

export function prepareProductInsertData(
  storeId: string,
  productId: string,
  input: CreateProductInput & { slug: string }
): NewProduct {
  return {
    id: productId,
    storeId,
    categoryId: input.categoryId ?? null,
    name: input.name,
    slug: input.slug,
    description: input.description ?? '',
    shortDescription: input.shortDescription ?? '',

    price: input.price,
    compareAtPrice: input.compareAtPrice ?? null,
    cost: input.cost ?? null,

    stock: input.stock ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? 5,
    sku: input.sku ?? null,
    barcode: input.barcode ?? null,

    weight: formatDimension(input.weight),
    length: formatDimension(input.length),
    width: formatDimension(input.width),
    height: formatDimension(input.height),

    images: input.images ?? [],
    mediaIds: [],
    videoUrl: input.videoUrl ?? null,
    imageSrc: input.images && input.images.length > 0 ? input.images[0].url : null,

    variants: input.variants ?? [],
    variantPrices: input.variantPrices ?? {},

    haggleEnabled: input.haggleEnabled ?? false,
    minPrice: input.minPrice ?? null,

    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,

    isPublished: input.isPublished ?? false,
    isFeatured: input.isFeatured ?? false,

    metadata: input.metadata ?? {},
    deletedAt: null,
    version: 1,
  };
}

export function prepareProductUpdateData(
  input: UpdateProductInput
): Partial<Omit<Product, 'id' | 'storeId' | 'createdAt'>> {
  const updateData: Partial<Omit<Product, 'id' | 'storeId' | 'createdAt'>> = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.slug !== undefined) updateData.slug = input.slug;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.shortDescription !== undefined) updateData.shortDescription = input.shortDescription;

  if (input.price !== undefined) updateData.price = input.price;
  if (input.compareAtPrice !== undefined) updateData.compareAtPrice = input.compareAtPrice;
  if (input.cost !== undefined) updateData.cost = input.cost;

  if (input.categoryId !== undefined) updateData.categoryId = input.categoryId;
  if (input.stock !== undefined) updateData.stock = input.stock;
  if (input.lowStockThreshold !== undefined) updateData.lowStockThreshold = input.lowStockThreshold;

  if (input.sku !== undefined) updateData.sku = input.sku;
  if (input.barcode !== undefined) updateData.barcode = input.barcode;

  if (input.weight !== undefined) updateData.weight = formatDimension(input.weight);
  if (input.length !== undefined) updateData.length = formatDimension(input.length);
  if (input.width !== undefined) updateData.width = formatDimension(input.width);
  if (input.height !== undefined) updateData.height = formatDimension(input.height);

  if (input.images !== undefined) {
    updateData.images = input.images;
    updateData.imageSrc = input.images.length > 0 ? input.images[0].url : null;
  }

  if (input.videoUrl !== undefined) updateData.videoUrl = input.videoUrl;
  if (input.variants !== undefined) updateData.variants = input.variants;
  if (input.variantPrices !== undefined) updateData.variantPrices = input.variantPrices;

  if (input.haggleEnabled !== undefined) updateData.haggleEnabled = input.haggleEnabled;
  if (input.minPrice !== undefined) updateData.minPrice = input.minPrice;

  if (input.metaTitle !== undefined) updateData.metaTitle = input.metaTitle;
  if (input.metaDescription !== undefined) updateData.metaDescription = input.metaDescription;

  if (input.isPublished !== undefined) updateData.isPublished = input.isPublished;
  if (input.isFeatured !== undefined) updateData.isFeatured = input.isFeatured;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;

  return updateData;
}

export function sanitizeProductInput<T extends Record<string, unknown>>(input: T): T {
  const sanitized = { ...input } as Record<string, unknown>;

  if (typeof sanitized.name === 'string') sanitized.name = sanitized.name.trim();
  if (typeof sanitized.slug === 'string') sanitized.slug = sanitized.slug.trim().toLowerCase();
  if (typeof sanitized.sku === 'string') sanitized.sku = sanitized.sku.trim().toUpperCase();
  if (typeof sanitized.barcode === 'string') sanitized.barcode = sanitized.barcode.trim();

  return sanitized as T;
}
export async function generateUniqueSlug(
  name: string,
  storeId: string,
  dbParam?: AppDb,
  excludeProductId?: string
): Promise<string> {
  const db = dbParam || (await getAppDb()).db;

  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);

  let slug = base || 'product';
  let counter = 1;

  while (true) {
    const conditions = [
      eq(products.storeId, storeId),
      eq(products.slug, slug),
      isNull(products.deletedAt),
    ];

    if (excludeProductId) {
      conditions.push(sql`${products.id} != ${excludeProductId}`);
    }

    const existing = await db.query.products.findFirst({
      where: and(...conditions),
      columns: { id: true },
    });

    if (!existing) return slug;

    slug = `${base}-${counter}`;
    counter++;

    if (counter > 100) {
      slug = `${base}-${randomUUID().slice(0, 8)}`;
      break;
    }
  }

  return slug;
}

export async function checkSkuExists(
  sku: string,
  storeId: string,
  excludeId?: string
): Promise<boolean> {
  const { db } = await getAppDb();

  const conditions = [
    eq(products.storeId, storeId),
    eq(products.sku, sku),
    isNull(products.deletedAt),
  ];

  if (excludeId) {
    conditions.push(sql`${products.id} != ${excludeId}`);
  }

  const existing = await db.query.products.findFirst({
    where: and(...conditions),
    columns: { id: true },
  });

  return !!existing;
}

export function validateProductPricing(
  price: number,
  compareAtPrice?: number | null,
  cost?: number | null,
  minPrice?: number | null
): boolean {
  if (price < 0) {
    throw new SystemError({
      code: 'PRODUCT_INVALID_PRICE',
      userMessage: 'السعر لا يمكن أن يكون سالباً',
      technicalMessage: `Negative price: ${price}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
    });
  }

  if (compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice < price) {
    throw new SystemError({
      code: 'PRODUCT_INVALID_COMPARE_PRICE',
      userMessage: 'السعر المقارن يجب أن يكون أكبر من أو يساوي السعر الأساسي',
      technicalMessage: `Compare price ${compareAtPrice} < price ${price}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
    });
  }

  if (cost !== undefined && cost !== null && cost < 0) {
    throw new SystemError({
      code: 'PRODUCT_INVALID_COST',
      userMessage: 'التكلفة لا يمكن أن تكون سالبة',
      technicalMessage: `Negative cost: ${cost}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
    });
  }

  if (cost !== undefined && cost !== null && cost > price) {
    throw new SystemError({
      code: 'PRODUCT_INVALID_COST_PRICE',
      userMessage: 'التكلفة لا يمكن أن تكون أكبر من السعر',
      technicalMessage: `Cost ${cost} > price ${price}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
    });
  }

  if (minPrice !== undefined && minPrice !== null && minPrice < 0) {
    throw new SystemError({
      code: 'PRODUCT_INVALID_MIN_PRICE',
      userMessage: 'الحد الأدنى للسعر لا يمكن أن يكون سالباً',
      technicalMessage: `Negative min price: ${minPrice}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
    });
  }

  if (minPrice !== undefined && minPrice !== null && minPrice > price) {
    throw new SystemError({
      code: 'PRODUCT_INVALID_MIN_PRICE_RANGE',
      userMessage: 'الحد الأدنى للسعر يجب أن يكون أقل من أو يساوي السعر الأساسي',
      technicalMessage: `Min price ${minPrice} > price ${price}`,
      category: 'business',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
    });
  }

  return true;
}

export function calculateVariantPrices(
  variants: { name: string; options: string[] }[],
  basePrice: number,
  variantPrices?: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};

  if (!variants || variants.length === 0) {
    return {};
  }

  const combinations = generateVariantCombinations(variants);

  for (const combo of combinations) {
    const key = combo.join('|');
    result[key] = variantPrices?.[key] ?? basePrice;
  }

  return result;
}

export function generateVariantCombinations(
  variants: { name: string; options: string[] }[]
): string[][] {
  if (variants.length === 0) return [];

  const result: string[][] = [];
  const totalCombinations = variants.reduce((acc, v) => acc * v.options.length, 1);

  for (let i = 0; i < totalCombinations; i++) {
    const combo: string[] = [];
    let remaining = i;
    for (let j = variants.length - 1; j >= 0; j--) {
      const options = variants[j].options;
      const index = remaining % options.length;
      combo.unshift(options[index]);
      remaining = Math.floor(remaining / options.length);
    }
    result.push(combo);
  }

  return result;
}

export async function invalidateStoreSnapshot(
  storeId: string
): Promise<{ storeId: string; storeSlug?: string; newVersion?: number }> {
  const { db } = await getAppDb();

  const [updatedStore] = await db
    .update(stores)
    .set({
      snapshotVersion: sql`${stores.snapshotVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(stores.id, storeId))
    .returning({ slug: stores.slug, snapshotVersion: stores.snapshotVersion });

  const storeSlug = updatedStore?.slug;
  const newVersion = updatedStore?.snapshotVersion;

  try {
    const { env } = await getCloudflareContext<{ env: Env }>();
    const kv = (env as Env & { STORE_SNAPSHOTS?: KVNamespace }).STORE_SNAPSHOTS;

    if (kv) {
      const keysToDelete = [
        `store:${storeId}:products:snapshot`,
        `store:${storeId}:version`,
      ];

      if (storeSlug) {
        keysToDelete.push(
          `store:${storeSlug}:products:snapshot`,
          `store:${storeSlug}:version`
        );
      }

      await Promise.all(keysToDelete.map((key) => kv.delete(key)));
    }

    if (storeSlug) {
      revalidateTag(`store-${storeSlug}`);
    }
    revalidateTag(`store-${storeId}`);

  } catch (error) {
    console.warn('[Snapshot Invalidation] Skipped or failed:', error);
  }

  return {
    storeId,
    storeSlug,
    newVersion,
  };
}