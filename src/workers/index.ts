// src/worker/index.ts

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getDb } from '@/lib/db/db';
import { eq, sql, and } from 'drizzle-orm'; // ✅ أضفنا and لدمج الشروط المزدوجة
import * as schema from '@/lib/db/schema';

// ============================================================
// 🏗️ تعريف البيئة (Bindings)
// ============================================================
export type Env = {
  DB: D1Database;
  R2_BUCKET: R2Bucket; // ✅ أساسي لمحرك الصور الهجين
  TELEGRAM_BOT_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  QSTASH_URL?: string;
  QSTASH_TOKEN?: string;
  // ملاحظة: في المراحل المتقدمة، سنضيف DB_1, DB_2, ... للتوسع العضوي
};

// ============================================================
// 🚀 إنشاء الـ Worker
// ============================================================
const app = new Hono<{ Bindings: Env }>();

// ============================================================
// 📦 Middleware
// ============================================================

// ✅ تسجيل الطلبات (مفيد جداً للـ Debugging في Cloudflare)
app.use('*', logger());

// ✅ CORS (مضبط بدقة للفرونت إند الخاص بنا فقط)
app.use('*', cors({
  origin: ['https://dokany.pages.dev', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'], // ✅ أضفنا الهيدر الخاص بالـ Idempotency
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

// ============================================================
// ❤️ Health Check
// ============================================================
app.get('/api/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      worker: 'dokany-api',
      environment: c.env.NEXT_PUBLIC_APP_URL?.includes('localhost') ? 'development' : 'production'
    }
  });
});

// ============================================================
// 🏪 Store API (Read Operations)
// ============================================================

// ✅ جلب بيانات متجر معين
app.get('/api/store/:slug', async (c) => {
  try {
    const db = getDb({ DB: c.env.DB });
    const slug = c.req.param('slug');

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) {
      return c.json({ success: false, error: 'Store not found' }, 404);
    }

    return c.json({ success: true, data: store });
  } catch (error) {
    console.error('❌ [Worker] Error fetching store:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ✅ جلب منتجات متجر معين (مع Pagination صحيح)
app.get('/api/store/:slug/products', async (c) => {
  try {
    const db = getDb({ DB: c.env.DB });
    const slug = c.req.param('slug');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100); // ✅ حماية من طلبات ضخمة (Max 100)
    const offset = Number(c.req.query('offset')) || 0;

    // 1. جلب بيانات المتجر للتحقق من الوجود
    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) {
      return c.json({ success: false, error: 'Store not found' }, 404);
    }

    // 2. جلب العدد الإجمالي للمنتجات (Pagination Correctness)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.products)
      .where(eq(schema.products.storeId, store.id));

    // 3. جلب المنتجات للصفحة الحالية
    const products = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.storeId, store.id))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        products,
        pagination: { 
          limit, 
          offset, 
          total: count, // ✅ العدد الحقيقي الكلي
          hasMore: offset + limit < count 
        },
      }
    });
  } catch (error) {
    console.error('❌ [Worker] Error fetching products:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ✅ جلب منتج مفرد (بـ slug)
app.get('/api/store/:slug/products/:productSlug', async (c) => {
  try {
    const db = getDb({ DB: c.env.DB });
    const slug = c.req.param('slug');
    const productSlug = c.req.param('productSlug');

    const store = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.slug, slug))
      .get();

    if (!store) {
      return c.json({ success: false, error: 'Store not found' }, 404);
    }

    // ✅ التصحيح الهندسي: استبدال .where() المكررة بـ and(...)
    const product = await db
      .select()
      .from(schema.products)
      .where(
        and(
          eq(schema.products.slug, productSlug),
          eq(schema.products.storeId, store.id) // ✅ ضمان أن المنتج يخص هذا المتجر فقط
        )
      )
      .get();

    if (!product) {
      return c.json({ success: false, error: 'Product not found' }, 404);
    }

    return c.json({ success: true, data: product });
  } catch (error) {
    console.error('❌ [Worker] Error fetching product:', error);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ============================================================
// 📦 تصدير الـ Worker
// ============================================================
export default app;