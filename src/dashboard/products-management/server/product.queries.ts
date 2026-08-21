// src/dashboard/products-management/server/product.queries.ts

'use server';

import { eq, and, desc, asc, count, isNull, like, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { safeExecute, SystemError } from '@/lib/errors';
import { getAppDb } from '@/lib/db/db';
import { products, productStats } from '@/lib/db/schema/products';
import { getStoreId } from './product.context';

export interface ListProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  minPrice?: number; // Integer (e.g. Cents/Piastres)
  maxPrice?: number; // Integer
  sortBy?: 'createdAt' | 'price' | 'salesCount' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export async function getProductAction(productId: string) {
  return safeExecute(async () => {
    const storeId = await getStoreId();
    const { db } = await getAppDb();
    
    const product = await db.query.products.findFirst({
      where: and(
        eq(products.id, productId), 
        eq(products.storeId, storeId), 
        isNull(products.deletedAt)
      ),
      with: { stats: true, category: true },
    });

    if (!product) {
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج غير موجود',
        technicalMessage: `Product not found: ${productId}`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { productId, storeId },
      });
    }

    return product;
  });
}

export async function listProductsAction(params: ListProductsParams) {
  const {
    page = 1,
    limit = 20,
    search,
    categoryId,
    isPublished,
    isFeatured,
    minPrice,
    maxPrice,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params;

  return safeExecute(async () => {
    const storeId = await getStoreId();
    const { db } = await getAppDb();
    const conditions = [eq(products.storeId, storeId), isNull(products.deletedAt)];

    // Clean search string for safety
    if (search && search.trim()) {
      const cleanSearch = `%${search.trim().replace(/[%_]/g, '\\$&')}%`;
      conditions.push(like(products.name, cleanSearch));
    }

    if (categoryId) conditions.push(eq(products.categoryId, categoryId));
    if (isPublished !== undefined) conditions.push(eq(products.isPublished, isPublished));
    if (isFeatured !== undefined) conditions.push(eq(products.isFeatured, isFeatured));
    
    // Ensure strict integer pricing boundaries
    if (minPrice !== undefined) conditions.push(sql`${products.price} >= ${Math.round(minPrice)}`);
    if (maxPrice !== undefined) conditions.push(sql`${products.price} <= ${Math.round(maxPrice)}`);

    const totalQuery = await db.select({ count: count() }).from(products).where(and(...conditions));
    const total = totalQuery[0]?.count || 0;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    // Direct Left Join Strategy when sorting by relational stats
    if (sortBy === 'salesCount') {
      const result = await db
        .select({
          product: products,
          stats: productStats,
        })
        .from(products)
        .leftJoin(productStats, eq(products.id, productStats.productId))
        .where(and(...conditions))
        .orderBy(orderFn(productStats.salesCount))
        .limit(limit)
        .offset((page - 1) * limit);

      return {
        items: result.map((r) => ({ ...r.product, stats: r.stats })),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    // Default Relational Query Strategy
    let orderColumn: AnySQLiteColumn = products.createdAt;
    if (sortBy === 'price') orderColumn = products.price;
    if (sortBy === 'name') orderColumn = products.name;

    const result = await db.query.products.findMany({
      where: and(...conditions),
      orderBy: [orderFn(orderColumn)],
      limit,
      offset: (page - 1) * limit,
      with: { stats: true, category: true },
    });

    return {
      items: result,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  });
}