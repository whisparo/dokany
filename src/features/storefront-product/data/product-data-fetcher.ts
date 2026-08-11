// src/features/storefront-product/data/product-data-fetcher.ts
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull, ne } from 'drizzle-orm';
import { products } from '@/lib/db/schema';
import type { ProductImage, ProductMetadata } from '@/lib/db/schema/products';
import type { Product } from '@/types';
import type { Env } from '@/lib/env';

function getDb(env: Env) {
  if (!env.DB) throw new Error('D1 Database binding not available');
  return drizzle(env.DB);
}

export function mapRawProducts(dbProducts: any[]): Product[] {
  return dbProducts.map((p) => {
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
}

// ✅ Plain async function - NO unstable_cache
export async function getProductData(
  storeId: string,
  slug: string,
  env: Env
): Promise<Product | null> {
  if (!storeId || !slug) throw new Error('[getProductData] storeId and slug are required');
  
  const db = getDb(env);
  const decodedSlug = decodeURIComponent(slug);
  
  const p = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.storeId, storeId),
        eq(products.slug, decodedSlug),
        isNull(products.deletedAt)
      )
    )
    .get();
  
  if (!p) return null;
  return mapRawProducts([p])[0];
}

// ✅ Plain async function - NO unstable_cache
export async function getRelatedProductsData(
  storeId: string,
  categoryId: string | null,
  currentProductId: string,
  env: Env,
  limit: number = 4
): Promise<Product[]> {
  const db = getDb(env);
  
  const conditions = [
    eq(products.storeId, storeId),
    ne(products.id, currentProductId),
    isNull(products.deletedAt),
  ];
  
  if (categoryId) {
    conditions.push(eq(products.categoryId, categoryId));
  }
  
  const dbProducts = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .limit(limit)
    .all();
  
  return mapRawProducts(dbProducts);
}