// src/workers/routes/store.ts

import { Hono } from 'hono';
import { Env } from '../../lib/env';
import { getDb } from '@/lib/db';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { SystemError } from '@/lib/errors/types';

export const storeRouter = new Hono<{ Bindings: Env }>();

storeRouter.get('/store/:slug', async (c) => {
  const db = getDb({ DB: c.env.DB }); 
  const slug = c.req.param('slug');

  // 1. الاستعلام من قاعدة البيانات
  const store = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.slug, slug))
    .get();

  // 2. معالجة حالة عدم وجود المتجر عبر SystemError
  if (!store) {
    throw new SystemError({
      code: 'STORE_404',
      userMessage: 'المتجر المطلوبة بياناته غير موجود أو تم إغلاقه.',
      technicalMessage: `Store with slug '${slug}' was not found in D1 database.`,
      category: 'business',
      severity: 'info', // خطأ عادي مش محتاج يزعج تليجرام
      retryable: false,
      shouldAlert: false, // مش هيتبعت تليجرام لكن هيتأرشف عادي
      context: {
        storeId: slug,
        path: c.req.path,
        method: c.req.method,
      }
    });
  }

  // 3. إرجاع البيانات بفرش نظيف
  return c.json({ 
    success: true, 
    data: store 
  }, 200);
});