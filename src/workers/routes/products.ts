// src/worker/routes/products.ts

import { Hono } from 'hono';
import { eq, and, ilike, sql, desc, isNull } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import type { ProductImage, ProductVariant, NewProduct } from '@/lib/db/schema/products';

/**
 * 📦 Products Router
 * 
 * مسؤول عن إدارة المنتجات مع ضمان عزل البيانات (Multi-tenancy)
 */
export const productsRouter = new Hono<{ Bindings: Env }>();

/**
 * دالة مساعدة لإنشاء Slug يدعم اللغة العربية والإنجليزية بأمان
 */
function generateSlug(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  
  return cleaned || `product-${Date.now()}`;
}

/**
 * GET /api/store/:slug/products
 * جلب منتجات متجر معين مع دعم الفلترة والـ Pagination والـ Soft Delete
 */
productsRouter.get('/store/:slug/products', async (c) => {
  try {
    const slug = c.req.param('slug');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
    const offset = Number(c.req.query('offset')) || 0;
    const search = c.req.query('search');
    const categoryId = c.req.query('categoryId');

    const minPriceQuery = c.req.query('minPrice');
    const maxPriceQuery = c.req.query('maxPrice');
    const minPrice = minPriceQuery ? Number(minPriceQuery) : undefined;
    const maxPrice = maxPriceQuery ? Number(maxPriceQuery) : undefined;

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) {
      return c.json({ success: false, error: 'Store not found' }, 404);
    }

    const conditions = [
      eq(schema.products.storeId, store.id),
      isNull(schema.products.deletedAt),
    ];

    if (search) conditions.push(ilike(schema.products.name, `%${search}%`));
    if (categoryId) conditions.push(eq(schema.products.categoryId, categoryId));
    
    if (minPrice !== undefined && !isNaN(minPrice)) {
      conditions.push(sql`CAST(${schema.products.price} AS REAL) >= ${minPrice}`);
    }
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      conditions.push(sql`CAST(${schema.products.price} AS REAL) <= ${maxPrice}`);
    }

    const whereClause = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.products)
      .where(whereClause);

    const products = await db
      .select()
      .from(schema.products)
      .where(whereClause)
      .orderBy(desc(schema.products.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        products,
        pagination: { limit, offset, total: count, hasMore: offset + limit < count },
      },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return c.json({ success: false, error: 'Failed to fetch products' }, 500);
  }
});

/**
 * GET /api/store/:slug/products/:productSlug
 * جلب منتج مفرد
 */
productsRouter.get('/store/:slug/products/:productSlug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const productSlug = c.req.param('productSlug');

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const product = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.slug, productSlug),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!product) return c.json({ success: false, error: 'Product not found' }, 404);

    return c.json({ success: true, data: product });
  } catch (error) {
    console.error('Error fetching product:', error);
    return c.json({ success: false, error: 'Failed to fetch product' }, 500);
  }
});

/**
 * POST /api/store/:slug/products
 * إنشاء منتج جديد
 */
productsRouter.post('/store/:slug/products', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json<{
      name: string;
      price: number | string;
      compareAtPrice?: number | string;
      description?: string;
      shortDescription?: string;
      categoryId?: string;
      stock?: number;
      sku?: string;
      barcode?: string;
      images?: ProductImage[];
      variants?: ProductVariant[];
      isPublished?: boolean;
      isFeatured?: boolean;
      haggleEnabled?: boolean;
      minPrice?: number | string;
    }>();

    if (!body.name || body.name.trim().length === 0) {
      return c.json({ success: false, error: 'Product name is required' }, 400);
    }
    
    const numericPrice = Number(body.price);
    if (body.price === undefined || isNaN(numericPrice) || numericPrice < 0) {
      return c.json({ success: false, error: 'Valid price is required' }, 400);
    }

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const slugified = generateSlug(body.name);

    const existingSlug = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.storeId, store.id),
          eq(schema.products.slug, slugified),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (existingSlug) {
      return c.json({ success: false, error: 'A product with this name/slug already exists' }, 409);
    }

    const now = new Date();

    const newProduct = await db
      .insert(schema.products)
      .values({
        id: crypto.randomUUID(),
        storeId: store.id,
        name: body.name.trim(),
        slug: slugified,
        price: String(body.price),
        compareAtPrice: body.compareAtPrice ? String(body.compareAtPrice) : null,
        description: body.description?.trim() || null,
        shortDescription: body.shortDescription?.trim() || null,
        categoryId: body.categoryId || null,
        stock: body.stock ?? 0,
        sku: body.sku || null,
        barcode: body.barcode || null,
        images: body.images || [],
        variants: body.variants || [],
        isPublished: body.isPublished ?? false,
        isFeatured: body.isFeatured ?? false,
        haggleEnabled: body.haggleEnabled ?? false,
        minPrice: body.minPrice ? String(body.minPrice) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ success: true, data: newProduct[0] }, 201);
  } catch (error) {
    console.error('Error creating product:', error);
    return c.json({ success: false, error: 'Failed to create product' }, 500);
  }
});

/**
 * PUT /api/store/:slug/products/:id
 * تحديث منتج موجود
 */
productsRouter.put('/store/:slug/products/:id', async (c) => {
  try {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const body = await c.req.json<{
      name?: string;
      price?: number | string;
      compareAtPrice?: number | string;
      description?: string;
      shortDescription?: string;
      categoryId?: string;
      stock?: number;
      sku?: string;
      barcode?: string;
      images?: ProductImage[];
      variants?: ProductVariant[];
      isPublished?: boolean;
      isFeatured?: boolean;
      haggleEnabled?: boolean;
      minPrice?: number | string;
    }>();

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const existing = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!existing) {
      return c.json({ success: false, error: 'Product not found or access denied' }, 404);
    }

    const updates: Partial<NewProduct> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      updates.name = body.name.trim();
      updates.slug = generateSlug(body.name);
    }
    if (body.price !== undefined) updates.price = String(body.price);
    if (body.compareAtPrice !== undefined) updates.compareAtPrice = body.compareAtPrice ? String(body.compareAtPrice) : null;
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.shortDescription !== undefined) updates.shortDescription = body.shortDescription?.trim() || null;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.stock !== undefined) updates.stock = body.stock;
    if (body.sku !== undefined) updates.sku = body.sku;
    if (body.barcode !== undefined) updates.barcode = body.barcode;
    if (body.images !== undefined) updates.images = body.images;
    if (body.variants !== undefined) updates.variants = body.variants;
    if (body.isPublished !== undefined) updates.isPublished = body.isPublished;
    if (body.isFeatured !== undefined) updates.isFeatured = body.isFeatured;
    if (body.haggleEnabled !== undefined) updates.haggleEnabled = body.haggleEnabled;
    if (body.minPrice !== undefined) updates.minPrice = body.minPrice ? String(body.minPrice) : null;

    const updated = await db
      .update(schema.products)
      .set(updates)
      .where(eq(schema.products.id, id))
      .returning();

    return c.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error('Error updating product:', error);
    return c.json({ success: false, error: 'Failed to update product' }, 500);
  }
});

/**
 * DELETE /api/store/:slug/products/:id
 * حذف منتج (Soft Delete)
 */
productsRouter.delete('/store/:slug/products/:id', async (c) => {
  try {
    const slug = c.req.param('slug');
    const id = c.req.param('id');

    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const product = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.id, id),
          eq(schema.products.storeId, store.id),
          isNull(schema.products.deletedAt)
        )
      )
      .get();

    if (!product) {
      return c.json({ success: false, error: 'Product not found or access denied' }, 404);
    }

    await db
      .update(schema.products)
      .set({ deletedAt: new Date() })
      .where(eq(schema.products.id, id));

    return c.json({ success: true, data: { message: 'Product deleted successfully' } });
  } catch (error) {
    console.error('Error deleting product:', error);
    return c.json({ success: false, error: 'Failed to delete product' }, 500);
  }
});