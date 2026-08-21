// src/dashboard/products-management/server/product.mutations.ts

'use server';

import { z } from 'zod';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { safeExecute, SystemError } from '@/lib/errors';
import { getAppDb } from '@/lib/db/db';
import { products, productStats } from '@/lib/db/schema/products';
import {
  createProductSchema,
  updateProductSchema,
  type CreateProductInput,
  type UpdateProductInput,
} from '@/lib/validations/product';
import { getStoreId } from './product.context';
import {
  generateUniqueSlug,
  invalidateStoreSnapshot,
  validateProductPricing,
  sanitizeProductInput,
  prepareProductInsertData,
  prepareProductUpdateData,
  checkSkuExists,
} from './product.helpers';

// ============================================================
// 📦 إنشاء منتج جديد (Write-Through DB & Snapshot)
// ============================================================

export async function createProductAction(input: CreateProductInput) {
  const validation = createProductSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      message: 'بيانات المنتج غير صحيحة',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const validatedData = sanitizeProductInput(validation.data);
  const storeId = await getStoreId();

  return await safeExecute(async () => {
    validateProductPricing(
      validatedData.price,
      validatedData.compareAtPrice,
      validatedData.cost,
      validatedData.minPrice
    );

    // 🔍 فحص عدم تكرار الـ SKU
    if (validatedData.sku) {
      const skuExists = await checkSkuExists(validatedData.sku, storeId);
      if (skuExists) {
        throw new SystemError({
          code: 'PRODUCT_SKU_EXISTS',
          userMessage: 'رمز المنتج (SKU) مستخدم بالفعل لمنتج آخر',
          technicalMessage: `Duplicate SKU: ${validatedData.sku}`,
          category: 'business',
          severity: 'warning',
          retryable: true,
          shouldAlert: false,
          metadata: { sku: validatedData.sku, storeId },
        });
      }
    }

    const { db } = await getAppDb();
    const slug =
      validatedData.slug || (await generateUniqueSlug(validatedData.name, storeId, db));

    const existing = await db.query.products.findFirst({
      where: and(eq(products.storeId, storeId), eq(products.slug, slug), isNull(products.deletedAt)),
    });

    if (existing) {
      throw new SystemError({
        code: 'PRODUCT_SLUG_EXISTS',
        userMessage: 'يوجد منتج بنفس الاسم، يرجى تغيير الاسم',
        technicalMessage: `Duplicate slug: ${slug}`,
        category: 'business',
        severity: 'warning',
        retryable: true,
        shouldAlert: false,
        metadata: { slug, storeId },
      });
    }

    const productId = crypto.randomUUID();
    const newProduct = prepareProductInsertData(storeId, productId, {
      ...validatedData,
      slug,
    });

    // ⚛️ إدخال المنتج والـ Stats داخل Atomic Transaction واحدة
    const result = await db.transaction(async (tx) => {
      const [insertedProduct] = await tx.insert(products).values(newProduct).returning();

      await tx.insert(productStats).values({
        id: crypto.randomUUID(),
        productId: insertedProduct.id,
        viewsCount: 0,
        salesCount: 0,
        reviewsCount: 0,
        rating: 0,
      });

      return insertedProduct;
    });

    await invalidateStoreSnapshot(storeId);

    return { success: true, message: 'تم إضافة المنتج بنجاح', data: result };
  });
}

// ============================================================
// ✏️ تحديث منتج (Write-Through DB & Snapshot)
// ============================================================

export async function updateProductAction(productId: string, input: UpdateProductInput) {
  const validation = updateProductSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      message: 'بيانات التحديث غير صحيحة',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const validatedData = sanitizeProductInput(validation.data);
  const storeId = await getStoreId();

  return await safeExecute(async () => {
    const { db } = await getAppDb();
    const existing = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج غير موجود أو لا يتبع متجرك',
        technicalMessage: `Product not found: ${productId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { productId, storeId },
      });
    }

    const targetPrice = validatedData.price ?? existing.price;
    const targetCompareAt = validatedData.compareAtPrice !== undefined ? validatedData.compareAtPrice : existing.compareAtPrice;
    const targetCost = validatedData.cost !== undefined ? validatedData.cost : existing.cost;
    const targetMinPrice = validatedData.minPrice !== undefined ? validatedData.minPrice : existing.minPrice;

    validateProductPricing(targetPrice, targetCompareAt, targetCost, targetMinPrice);

    let updatedSlug = validatedData.slug;
    if (validatedData.name !== undefined && validatedData.name !== existing.name && !updatedSlug) {
      updatedSlug = await generateUniqueSlug(validatedData.name, storeId, db, productId);
    }

    const updatePayload = prepareProductUpdateData({
      ...validatedData,
      ...(updatedSlug && { slug: updatedSlug }),
    });

    const [result] = await db
      .update(products)
      .set({
        ...updatePayload,
        updatedAt: new Date(),
        version: sql`${products.version} + 1`,
      })
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
      .returning();

    await invalidateStoreSnapshot(storeId);

    return { success: true, message: 'تم تحديث المنتج بنجاح', data: result };
  });
}

// ============================================================
// 🗑️ حذف منتج (Soft Delete + Write-Through Snapshot Invalidation)
// ============================================================

export async function deleteProductAction(productId: string) {
  const storeId = await getStoreId();

  return await safeExecute(async () => {
    const { db } = await getAppDb();
    const existing = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج غير موجود أو لا يتبع متجرك',
        technicalMessage: `Product not found for deletion: ${productId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { productId, storeId },
      });
    }

    await db
      .update(products)
      .set({
        deletedAt: new Date(),
        version: sql`${products.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)));

    await invalidateStoreSnapshot(storeId);

    return { success: true, message: 'تم حذف المنتج بنجاح' };
  });
}

// ============================================================
// 🔄 تحديث المخزون (Stock Update + Write-Through)
// ============================================================

export async function updateStockAction(productId: string, newStock: number) {
  const storeId = await getStoreId();

  if (newStock < 0) {
    return { success: false, message: 'المخزون لا يمكن أن يكون سالباً' };
  }

  return await safeExecute(async () => {
    const { db } = await getAppDb();
    const existing = await db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.storeId, storeId), isNull(products.deletedAt)),
    });

    if (!existing) {
      throw new SystemError({
        code: 'PRODUCT_NOT_FOUND',
        userMessage: 'المنتج غير موجود',
        technicalMessage: `Product not found for stock update: ${productId}`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { productId, storeId },
      });
    }

    const [result] = await db
      .update(products)
      .set({
        stock: newStock,
        version: sql`${products.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
      .returning({ stock: products.stock, version: products.version });

    await invalidateStoreSnapshot(storeId);

    return { success: true, message: 'تم تحديث المخزون بنجاح', data: result };
  });
}