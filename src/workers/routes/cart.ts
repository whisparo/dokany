// src/workers/routes/cart.ts
import { Hono } from 'hono';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { SystemError } from '@/lib/errors/types';

export const cartRouter = new Hono<{ Bindings: Env }>();

// ============================================================
// 🛒 Cart Sync Route - مزامنة السلة مع قاعدة البيانات (محسن للتكلفة والأداء)
// ============================================================
/**
 * POST /api/cart/sync
 * 
 * Body: {
 *   items: Array<{
 *     productId: string;
 *     variantId?: string;
 *     quantity: number;
 *   }>
 * }
 */
cartRouter.post('/cart/sync', async (c) => {
  try {
    const body = await c.req.json<{
      items: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
      }>;
    }>();

    if (!body.items || !Array.isArray(body.items)) {
      throw new SystemError({
        code: 'CART_400',
        userMessage: 'بيانات السلة غير صالحة',
        technicalMessage: 'Invalid cart items payload',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
      });
    }

    const storeId = c.req.header('x-store-id');
    if (!storeId) {
      throw new SystemError({
        code: 'CART_400',
        userMessage: 'معرف المتجر مطلوب',
        technicalMessage: 'Store ID is required in headers',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
      });
    }

    const sessionId = c.req.header('x-session-id') || generateSessionId(c);
    const customerId = c.req.header('x-customer-id') || null;
    const db = getDb({ DB: c.env.DB });

    // 1️⃣ جلب جميع العناصر الحالية من السلة في استعلام واحد
    const existingItems = await db
      .select()
      .from(schema.cartItems)
      .where(
        and(
          eq(schema.cartItems.storeId, storeId),
          customerId
            ? eq(schema.cartItems.customerId, customerId)
            : eq(schema.cartItems.sessionId, sessionId)
        )
      );

    const existingMap = new Map(
      existingItems.map((item) => [
        `${item.productId}_${item.variantSku || 'default'}`,
        item,
      ])
    );

    const warnings: Array<{ itemId: string; message: string }> = [];

    // 2️⃣ جلب جميع المنتجات المطلوبة دفعة واحدة (In Bulk) لتوفير قراءات D1 والتكلفة
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

    // 3️⃣ معالجة التحديثات والإضافات في الـ Memory أولاً
    for (const cartItem of body.items) {
      const product = productsMap.get(cartItem.productId);
      const itemKey = `${cartItem.productId}_${cartItem.variantId || 'default'}`;

      if (!product) {
        warnings.push({
          itemId: itemKey,
          message: 'المنتج غير موجود أو تم حذفه',
        });
        continue;
      }

      // التحقق من المخزون المتاح
      const availableStock = product.stock ?? 999;
      const requestedQty = Math.min(cartItem.quantity, availableStock);

      if (requestedQty !== cartItem.quantity) {
        warnings.push({
          itemId: itemKey,
          message: `تم تعديل الكمية إلى ${requestedQty} بسبب محدودية المخزون`,
        });
      }

      if (requestedQty <= 0) continue;

      const existingItem = existingMap.get(itemKey);

      if (existingItem) {
        // تحديث العنصر الموجود
        await db
          .update(schema.cartItems)
          .set({
            quantity: requestedQty,
            updatedAt: new Date(),
          })
          .where(eq(schema.cartItems.id, existingItem.id));

        existingMap.delete(itemKey);
      } else {
        // إدراج عنصر جديد
        const variantSku = cartItem.variantId || `${cartItem.productId}-default`;
        const priceAtAdd = typeof product.price === 'string' 
          ? product.price 
          : String(product.price);

        await db.insert(schema.cartItems).values({
          id: crypto.randomUUID(),
          sessionId: customerId ? null : sessionId,
          customerId: customerId || null,
          storeId,
          productId: cartItem.productId,
          variantSku,
          quantity: requestedQty,
          priceAtAdd,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // 4️⃣ تنظيف وتفريغ العناصر المحذوفة من السلة
    for (const remainingItem of existingMap.values()) {
      await db
        .delete(schema.cartItems)
        .where(eq(schema.cartItems.id, remainingItem.id));
    }

    return c.json({
      success: true,
      syncedAt: new Date().toISOString(),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('Cart sync error:', error);

    if (error instanceof SystemError) {
      return c.json(
        {
          success: false,
          error: error.userMessage,
          code: error.code,
        },
        400
      );
    }

    return c.json(
      {
        success: false,
        error: 'فشل في مزامنة السلة',
      },
      500
    );
  }
});

// ============================================================
// ✅ Cart Validate Route - التحقق السريع من المخزون والأسعار (In Bulk)
// ============================================================
/**
 * POST /api/cart/validate
 * 
 * Body: {
 *   items: Array<{
 *     id: string;
 *     productId: string;
 *     variantId?: string;
 *     quantity: number;
 *   }>
 * }
 */
cartRouter.post('/cart/validate', async (c) => {
  try {
    const body = await c.req.json<{
      items: Array<{
        id: string;
        productId: string;
        variantId?: string;
        quantity: number;
      }>;
    }>();

    if (!body.items || !Array.isArray(body.items)) {
      return c.json(
        {
          success: false,
          error: 'بيانات غير صالحة',
        },
        400
      );
    }

    const db = getDb({ DB: c.env.DB });

    // جلب جميع منتجات الفحص في Query واحدة فقط لحفظ التكلفة
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
        };
      }

      const maxStock = product.stock ?? 999;
      const currentPrice =
        typeof product.price === 'string'
          ? parseFloat(product.price)
          : Number(product.price);

      return {
        id: item.id,
        maxStock,
        currentPrice,
      };
    });

    return c.json({
      success: true,
      validated,
    });
  } catch (error) {
    console.error('Cart validate error:', error);
    return c.json(
      {
        success: false,
        error: 'فشل في التحقق من المخزون',
      },
      500
    );
  }
});

// ============================================================
// 🧰 Helper: Session ID Generator
// ============================================================
function generateSessionId(c: any): string {
  const cookieHeader = c.req.header('cookie') || '';
  const sessionMatch = cookieHeader.match(/session_id=([^;]+)/);

  if (sessionMatch) {
    return sessionMatch[1];
  }

  return `sess_${crypto.randomUUID()}`;
}