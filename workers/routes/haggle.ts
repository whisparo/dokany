// src/workers/routes/haggle.ts

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import type { AppEnv } from '../../src/lib/env';
import * as schema from '../../src/lib/db/schema';
import { getDb } from '../../src/lib/db/db';
import { SystemError, safeExecute } from '../../src/lib/errors';
import { HaggleService } from '../../src/lib/services/haggle-service';
import type { HaggleStrategy } from '../../src/lib/db/schema/haggle-sessions';

// ✅ استخدام AppEnv الموحد
export const haggleRouter = new Hono<AppEnv>();

/**
 * جلب المتجر والتأكد من وجوده (Public Check)
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

/**
 * 🚀 POST /api/haggle - إنشاء جلسة مساومة جديدة (Public for Customers)
 */
haggleRouter.post('/haggle', (c) =>
  safeExecute(async () => {
    const body = await c.req.json<{
      storeId?: string;
      productId?: string;
      customerId?: string;
      originalPrice?: string | number;
      minAllowedPrice?: string | number;
      initialOffer?: string | number;
      maxRounds?: number;
      durationInMinutes?: number;
      strategy?: HaggleStrategy;
    }>();

    const {
      storeId,
      productId,
      customerId,
      originalPrice,
      minAllowedPrice,
      initialOffer,
      maxRounds,
      durationInMinutes,
      strategy,
    } = body;

    if (!storeId || !productId || !originalPrice || !minAllowedPrice || !initialOffer) {
      throw new SystemError({
        code: 'VAL_001',
        userMessage: 'بيانات غير مكتملة لإنشاء جلسة المساومة.',
        technicalMessage: 'Missing required fields for haggle session creation.',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: storeId ?? undefined,
        metadata: { path: c.req.path },
      });
    }

    const db = getDb({ DB: c.env.DB });

    // 🛡️ التحقق من وجود المتجر فقط
    await getStoreByIdOrThrow(db, storeId, c.req.path);

    const haggleService = new HaggleService(db);

    const result = await haggleService.createSession({
      storeId,
      productId,
      customerId,
      originalPrice: String(originalPrice),
      minAllowedPrice: String(minAllowedPrice),
      initialOffer: String(initialOffer),
      maxRounds,
      durationInMinutes,
      strategy,
    });

    return c.json(result, 201);
  })
);

/**
 * 💬 PATCH /api/haggle - تقديم عرض جديد داخل جلسة قائمة (Public for Customers)
 */
haggleRouter.patch('/haggle', (c) =>
  safeExecute(async () => {
    const body = await c.req.json<{
      sessionId?: string;
      customerId?: string;
      offeredPrice?: string | number;
      message?: string;
    }>();

    const { sessionId, customerId, offeredPrice, message } = body;

    if (!sessionId || !offeredPrice) {
      throw new SystemError({
        code: 'VAL_001',
        userMessage: 'بيانات غير مكتملة (sessionId و offeredPrice مطلوبان).',
        technicalMessage: 'Missing sessionId or offeredPrice for haggle offer.',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const db = getDb({ DB: c.env.DB });

    // جلب الجلسة للحصول على storeId
    const session = await db
      .select({ storeId: schema.haggleSessions.storeId })
      .from(schema.haggleSessions)
      .where(eq(schema.haggleSessions.id, sessionId))
      .get();

    if (!session) {
      throw new SystemError({
        code: 'HAGGLE_404',
        userMessage: 'جلسة المساومة غير موجودة.',
        technicalMessage: `Haggle session '${sessionId}' not found.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path, sessionId },
      });
    }

    // 🛡️ التحقق من وجود المتجر
    await getStoreByIdOrThrow(db, session.storeId, c.req.path);

    const haggleService = new HaggleService(db);

    const result = await haggleService.submitOffer({
      sessionId,
      customerId,
      offeredPrice: String(offeredPrice),
      message,
    });

    if (!result.success) {
      return c.json(result, 400);
    }

    return c.json(result, 200);
  })
);