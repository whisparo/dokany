// src/workers/routes/store.ts

import { Hono } from 'hono';
import { Env } from '@/lib/env';
import { getDb } from '@/lib/db';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { SystemError } from '@/lib/errors/types';

export const storeRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/store/:slug
 * جلب بيانات المتجر مع إحصائياته وتأكيد أنه نشط وغير محذوف
 */
storeRouter.get('/store/:slug', async (c) => {
  const db = getDb({ DB: c.env.DB });
  const slug = c.req.param('slug');

  // 1. الاستعلام مع تفعيل شروط الـ Soft Delete والـ Active
  const store = await db
    .select()
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.slug, slug),
        eq(schema.stores.isActive, true),
        sql`${schema.stores.deletedAt} IS NULL`
      )
    )
    .get();

  // 2. معالجة عدم وجود المتجر أو إغلاقه
  // src/workers/routes/store.ts

if (!store) {
  throw new SystemError({
    code: 'STORE_404',
    userMessage: 'المتجر المطلوب غير موجود أو غير متاح حالياً.',
    technicalMessage: `Active and non-deleted store with slug '${slug}' was not found in D1 database.`,
    category: 'business',
    severity: 'info',
    retryable: false,
    shouldAlert: false,
    context: {
      storeId: slug, // 👈 تم تمرير slug هنا لتلبية خاصية storeId الإلزامية
      path: c.req.path,
      method: c.req.method,
      extras: { slug },
    },
  });
}

  // 3. جلب الإحصائيات الخاصة بالمتجر
  const stats = await db
    .select()
    .from(schema.storeStats)
    .where(eq(schema.storeStats.storeId, store.id))
    .get();

  // 4. تحليل إعدادات الـ JSON بأمان
  let parsedSettings = {};
  let parsedTheme = {};
  try {
    parsedSettings = typeof store.settings === 'string' ? JSON.parse(store.settings) : store.settings;
    parsedTheme = typeof store.theme === 'string' ? JSON.parse(store.theme) : store.theme;
  } catch {
    parsedSettings = {};
    parsedTheme = {};
  }

  // 5. إرجاع البيانات النظيفة بالكامل
  return c.json(
    {
      success: true,
      data: {
        ...store,
        settings: parsedSettings,
        theme: parsedTheme,
        stats: stats || {
          totalProducts: 0,
          totalOrders: 0,
          totalCustomers: 0,
          totalRevenue: '0',
        },
      },
    },
    200
  );
});