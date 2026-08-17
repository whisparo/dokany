// src/workers/routes/cart.ts

import { Hono, type Context } from 'hono';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { AppEnv } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import type { CartVariant } from '@/lib/db/schema/cart-items';
// 🟢 الاستيراد الصح والموحد لأخطاء النظام
import { safeExecute, SystemError } from '@/lib/errors';

export const cartRouter = new Hono<AppEnv>();

/**
 * دالة مساعدة لتوليد أو استخراج Session ID للزوار بطريقة آمنة
 */
function getOrGenerateSessionId(c: Context<AppEnv>): string {
  const cookieHeader = c.req.header('cookie') || '';
  const sessionMatch = cookieHeader.match(/session_id=([^;]+)/);

  if (sessionMatch && sessionMatch[1]) {
    return sessionMatch[1];
  }

  return `sess_${crypto.randomUUID()}`;
}

/**
 * جلب المتجر من storeId والتأكد من وجوده
 */
async function getStoreByIdOrThrow(
  db: ReturnType<typeof getDb>,
  storeId: string,
  path: string
) {
  const store = await db
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), isNull(schema.stores.deletedAt)))
    .get();

  if (!store) {
    throw new SystemError({
      code: 'STORE_NOT_FOUND',
      userMessage: 'المتجر المطلوب غير موجود.',
      technicalMessage: `Store with id '${storeId}' not found or deleted.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      storeId,
      metadata: { path },
    });
  }

  return store;
}

// ============================================================
// 🟢 POST Routes (Public Cart Management)
// ============================================================

/**
 * POST /api/cart/sync
 * مزامنة عناصر السلة مع قاعدة البيانات للزوار والعملاء
 */
cartRouter.post('/cart/sync', (c) =>
  safeExecute(async () => {
    const body = await c.req.json<{
      items?: Array<{
        productId: string;
        variantSku?: string;
        variant?: CartVariant;
        quantity: number;
      }>;
    }>();

    if (!body.items || !Array.isArray(body.items)) {
      throw new SystemError({
        code: 'CART_400',
        userMessage: 'بيانات السلة غير صالحة.',
        technicalMessage: 'Invalid cart items payload',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const storeId = c.req.header('x-store-id');
    if (!storeId) {
      throw new SystemError({
        code: 'CART_400',
        userMessage: 'معرف المتجر مطلوب.',
        technicalMessage: 'Store ID is required in headers (x-store-id)',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const db = getDb({ DB: c.env.DB });

    // 🛡️ التحقق من وجود المتجر فقط (بدون تقييد المالك للعملاء)
    await getStoreByIdOrThrow(db, storeId, c.req.path);

    const customerIdHeader = c.req.header('x-customer-id');
    const customerId = customerIdHeader && customerIdHeader.trim() !== '' ? customerIdHeader.trim() : null;
    const sessionId = customerId ? null : (c.req.header('x-session-id') || getOrGenerateSessionId(c));

    // 1️⃣ جلب جميع العناصر الحالية للسلة
    const ownerWhereClause = and(
      eq(schema.cartItems.storeId, storeId),
      customerId
        ? eq(schema.cartItems.customerId, customerId)
        : eq(schema.cartItems.sessionId, sessionId as string)
    );

    const existingItems = await db
      .select()
      .from(schema.cartItems)
      .where(ownerWhereClause);

    const existingMap = new Map(
      existingItems.map((item) => [
        `${item.productId}_${item.variantSku}`,
        item,
      ])
    );

    const warnings: Array<{ itemId: string; message: string }> = [];

    // 2️⃣ جلب كافة المنتجات المطلوبة دفعة واحدة
    const productIds = Array.from(new Set(body.items.map((i) => i.productId)));

    const fetchedProducts = productIds.length > 0
      ? await db
          .select()
          .from(schema.products)
          .where(
            and(
              inArray(schema.products.id, productIds),
              eq(schema.products.storeId, storeId),
              isNull(schema.products.deletedAt)
            )
          )
      : [];

    const productsMap = new Map(fetchedProducts.map((p) => [p.id, p]));
    const now = new Date();

    const itemsToInsert: Array<typeof schema.cartItems.$inferInsert> = [];
    const updatePromises: Promise<unknown>[] = [];

    // 3️⃣ معالجة عناصر السلة
    for (const cartItem of body.items) {
      const product = productsMap.get(cartItem.productId);
      const variantSku = cartItem.variantSku?.trim() || `${cartItem.productId}-default`;
      const itemKey = `${cartItem.productId}_${variantSku}`;

      if (!product) {
        warnings.push({
          itemId: itemKey,
          message: 'المنتج غير موجود أو تم حذفه.',
        });
        continue;
      }

      const availableStock = product.stock ?? 999;
      const requestedQty = Math.min(cartItem.quantity, availableStock);

      if (requestedQty !== cartItem.quantity) {
        warnings.push({
          itemId: itemKey,
          message: `تم تعديل الكمية إلى ${requestedQty} بسبب محدودية المخزون المتاح.`,
        });
      }

      if (requestedQty <= 0) continue;

      const existingItem = existingMap.get(itemKey);

      const rawPrice = typeof product.price === 'string' ? parseFloat(product.price) : Number(product.price);
      const priceAtAdd = Math.round(rawPrice);

      if (existingItem) {
        updatePromises.push(
          db
            .update(schema.cartItems)
            .set({
              quantity: requestedQty,
              priceAtAdd,
              variant: cartItem.variant || existingItem.variant,
              updatedAt: now,
            })
            .where(
              and(
                eq(schema.cartItems.id, existingItem.id),
                ownerWhereClause
              )
            )
        );

        existingMap.delete(itemKey);
      } else {
        itemsToInsert.push({
          id: crypto.randomUUID(),
          sessionId,
          customerId,
          storeId,
          productId: cartItem.productId,
          variantSku,
          variant: cartItem.variant || {},
          quantity: requestedQty,
          priceAtAdd,
          source: 'web',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // تنفيذ الإدخالات دفعة واحدة
    if (itemsToInsert.length > 0) {
      updatePromises.push(db.insert(schema.cartItems).values(itemsToInsert));
    }

    // 4️⃣ حذف باقي العناصر غير الموجودة في الـ Payload
    const itemsToDeleteIds = Array.from(existingMap.values()).map((item) => item.id);
    if (itemsToDeleteIds.length > 0) {
      updatePromises.push(
        db
          .delete(schema.cartItems)
          .where(
            and(
              inArray(schema.cartItems.id, itemsToDeleteIds),
              ownerWhereClause
            )
          )
      );
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    return c.json({
      success: true,
      syncedAt: now.toISOString(),
      warnings: warnings.length > 0 ? warnings : undefined,
    }, 200);
  })
);

/**
 * POST /api/cart/validate
 * فحص سريع للأسعار والكميات المتاحة قبل الدفع
 */
cartRouter.post('/cart/validate', (c) =>
  safeExecute(async () => {
    const body = await c.req.json<{
      items?: Array<{
        id: string;
        productId: string;
        variantSku?: string;
        quantity: number;
      }>;
    }>();

    if (!body.items || !Array.isArray(body.items)) {
      throw new SystemError({
        code: 'CART_400',
        userMessage: 'بيانات فحص السلة غير صالحة.',
        technicalMessage: 'Invalid validation items payload',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const storeId = c.req.header('x-store-id');
    if (!storeId) {
      throw new SystemError({
        code: 'CART_400',
        userMessage: 'معرف المتجر مطلوب.',
        technicalMessage: 'Store ID is required in headers (x-store-id)',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const db = getDb({ DB: c.env.DB });

    // 🛡️ التحقق من وجود المتجر فقط
    await getStoreByIdOrThrow(db, storeId, c.req.path);

    const productIds = Array.from(new Set(body.items.map((i) => i.productId)));

    const fetchedProducts = productIds.length > 0
      ? await db
          .select()
          .from(schema.products)
          .where(
            and(
              inArray(schema.products.id, productIds),
              eq(schema.products.storeId, storeId),
              isNull(schema.products.deletedAt)
            )
          )
      : [];

    const productsMap = new Map(fetchedProducts.map((p) => [p.id, p]));

    const validated = body.items.map((item) => {
      const product = productsMap.get(item.productId);

      if (!product) {
        return {
          id: item.id,
          maxStock: 0,
          currentPrice: 0,
          isAvailable: false,
        };
      }

      const maxStock = product.stock ?? 999;
      const currentPrice = typeof product.price === 'string'
        ? parseFloat(product.price)
        : Number(product.price);

      return {
        id: item.id,
        maxStock,
        currentPrice,
        isAvailable: maxStock >= item.quantity,
      };
    });

    return c.json({
      success: true,
      validated,
    }, 200);
  })
);