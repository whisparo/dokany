// src/workers/routes/cart.ts

import { Hono, type Context } from 'hono';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import type { CartVariant } from '@/lib/db/schema/cart-items';
import { SystemError } from '@/lib/errors/types';

export const cartRouter = new Hono<{ Bindings: Env }>();

/**
 * دالة مساعدة لتوليد أو استخراج Session ID للزوار دون استخدام any
 */
function getOrGenerateSessionId(c: Context<{ Bindings: Env }>): string {
  const cookieHeader = c.req.header('cookie') || '';
  const sessionMatch = cookieHeader.match(/session_id=([^;]+)/);

  if (sessionMatch) {
    return sessionMatch[1];
  }

  return `sess_${crypto.randomUUID()}`;
}

/**
 * POST /api/cart/sync
 * مزامنة عناصر السلة مع قاعدة البيانات بأعلى أداء وتوافق تام مع السكيما
 */
cartRouter.post('/cart/sync', async (c) => {
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
      context: { storeId: 'N/A', path: c.req.path },
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
      context: { storeId: 'UNKNOWN', path: c.req.path },
    });
  }

  const customerIdHeader = c.req.header('x-customer-id');
  const customerId = customerIdHeader && customerIdHeader.trim() !== '' ? customerIdHeader.trim() : null;
  // الالتزام بشرط XOR: في حالة وجود Customer لا نستخدم Session ID
  const sessionId = customerId ? null : (c.req.header('x-session-id') || getOrGenerateSessionId(c));

  const db = getDb({ DB: c.env.DB });

  // 1️⃣ جلب جميع العناصر الحالية للسلة
  const existingItems = await db
    .select()
    .from(schema.cartItems)
    .where(
      and(
        eq(schema.cartItems.storeId, storeId),
        customerId
          ? eq(schema.cartItems.customerId, customerId)
          : eq(schema.cartItems.sessionId, sessionId as string)
      )
    );

  const existingMap = new Map(
    existingItems.map((item) => [
      `${item.productId}_${item.variantSku}`,
      item,
    ])
  );

  const warnings: Array<{ itemId: string; message: string }> = [];

  // 2️⃣ جلب كافة المنتجات المطلوبة دفعة واحدة (In Bulk)
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

    if (existingItem) {
      await db
        .update(schema.cartItems)
        .set({
          quantity: requestedQty,
          updatedAt: new Date(),
        })
        .where(eq(schema.cartItems.id, existingItem.id));

      existingMap.delete(itemKey);
    } else {
      const priceAtAdd = typeof product.price === 'string'
        ? product.price
        : String(product.price);

      await db.insert(schema.cartItems).values({
        id: crypto.randomUUID(),
        sessionId,
        customerId,
        storeId,
        productId: cartItem.productId,
        variantSku,
        variant: cartItem.variant || {},
        quantity: requestedQty,
        priceAtAdd,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // 4️⃣ حذف باقي العناصر غير الموجودة في الـ Payload الجديد
  for (const remainingItem of existingMap.values()) {
    await db
      .delete(schema.cartItems)
      .where(eq(schema.cartItems.id, remainingItem.id));
  }

  return c.json({
    success: true,
    syncedAt: new Date().toISOString(),
    warnings: warnings.length > 0 ? warnings : undefined,
  }, 200);
});

/**
 * POST /api/cart/validate
 * فحص سريع للأسعار والكميات المتاحة قبل الدفع (In Bulk)
 */
cartRouter.post('/cart/validate', async (c) => {
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
      context: { storeId: 'N/A', path: c.req.path },
    });
  }

  const db = getDb({ DB: c.env.DB });
  const productIds = Array.from(new Set(body.items.map((i) => i.productId)));

  const fetchedProducts = productIds.length > 0
    ? await db
        .select()
        .from(schema.products)
        .where(
          and(
            inArray(schema.products.id, productIds),
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
});