// src/workers/routes/coupons.ts

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { CouponService } from '@/lib/services/coupon-service';
import type { AppEnv } from '@/lib/env';
import * as schema from '@/lib/db/schema';
import { getDb } from '@/lib/db/db';
// 🟢 الاستيراد الصح من البوابة الموحدة مباشرة
import { safeExecute, SystemError } from '@/lib/errors';

export const couponsRouter = new Hono<AppEnv>();

/**
 * جلب المتجر والتأكد من وجوده (للعمليات العامة)
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

// 🛡️ Zod Schema للتحقق من مدخلات الكوبون
const validateCouponBodySchema = z.object({
  storeId: z.string().uuid('معرف المتجر غير صالح'),
  code: z.string().trim().min(1, 'كود الكوبون مطلوب'),
  cartTotalAmount: z.union([z.string(), z.number()]).transform((val) => String(val)),
  customerId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

/**
 * 🎟️ POST /api/coupons/validate - التحقق من صحة كود الخصم أثناء الشراء
 */
couponsRouter.post('/coupons/validate', (c) =>
  safeExecute(async () => {
    const body = await c.req.json();
    const parsed = validateCouponBodySchema.safeParse(body);

    if (!parsed.success) {
      const extractedStoreId = typeof body?.storeId === 'string' ? body.storeId : undefined;

      throw new SystemError({
        code: 'VALIDATION_ERROR',
        userMessage: parsed.error.issues[0]?.message || 'بيانات الكوبون غير صالحة',
        technicalMessage: JSON.stringify(parsed.error.issues),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: extractedStoreId,
        metadata: {
          path: c.req.path,
        },
      });
    }

    const { storeId, code, cartTotalAmount, customerId, categoryId, productId } = parsed.data;

    const db = getDb({ DB: c.env.DB });

    // 1. التأكد من وجود المتجر أولاً
    await getStoreByIdOrThrow(db, storeId, c.req.path);

    // 2. استدعاء خدمة الكوبونات للتحقق
    const couponService = new CouponService(db);

    const result = await couponService.validateCoupon({
      storeId,
      code,
      cartTotalAmount,
      customerId,
      categoryId,
      productId,
    });

    if (!result.valid) {
      return c.json(result, 400);
    }

    return c.json(result, 200);
  })
);