// workers/index.ts

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';
import type { Env } from '../src/lib/env';

// Routes
import { healthRouter } from './routes/health';
import { storeRouter } from './routes/store';
import { categoriesRouter } from './routes/categories';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';
import { authRouter } from './routes/auth';
import { telegramRouter } from './routes/telegram';
import { cronRouter } from './routes/cron';
import { errorsRouter } from './routes/errors';
import { cartRouter } from './routes/cart';
import { couponsRouter } from './routes/coupons';
import { haggleRouter } from './routes/haggle';
import { snapshotRouter } from './routes/snapshot';
import testAlertsRouter from './routes/test-alerts';

// 🟢 الاستيراد الموحد من نظام إدارة الأخطاء ومعالجة الدفعات
import { 
  safeExecute, 
  SystemError, 
  processErrorQueue, 
  processBatchFlush 
} from '../src/lib/errors';

// 🌐 استيراد الـ OpenNext Server Handler
// @ts-ignore
import openNextHandler from '../.open-next/worker.js';

const app = new Hono<{ Bindings: Env }>();

// Middlewares
app.use('*', logger());

// ⚡ 1. معالجة الـ Trailing Slash لمسارات الباك إند لمنع Redirect Loop
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const isBackendRoute = url.pathname.startsWith('/api') || url.pathname.startsWith('/ping');

  if (isBackendRoute && url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    return c.redirect(url.toString(), 301);
  }
  await next();
});

// ⚡ 2. Dynamic CORS Origin Resolution مع Micro-Cache لـ Custom Domains KV
app.use('*', async (c, next) => {
  const staticOrigins = [
    'https://www.dokany.workers.dev',
    'http://localhost:3000',
    'http://localhost:8787',
    'http://127.0.0.1:3000',
  ];

  const corsMiddleware = cors({
    origin: async (origin) => {
      if (!origin) return '*';

      if (staticOrigins.includes(origin)) {
        return origin;
      }

      try {
        const url = new URL(origin);

        if (url.hostname.endsWith('.dokany.workers.dev')) {
          return origin;
        }

        if (c.env.CUSTOM_DOMAINS_KV) {
          const cache = caches.default;
          const cacheKey = new Request(`https://internal-cache/domain-check/${url.hostname}`);

          let response = await cache.match(cacheKey);

          if (!response) {
            const isCustomDomain = await c.env.CUSTOM_DOMAINS_KV.get(`domain:${url.hostname}`);
            const isValid = !!isCustomDomain;

            response = new Response(JSON.stringify({ valid: isValid }), {
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300',
              },
            });

            c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
          }

          const cacheData = (await response.json()) as { valid: boolean };
          if (cacheData.valid) {
            return origin;
          }
        }
      } catch {
        return null;
      }

      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'If-None-Match',
      'X-Idempotency-Key',
      'X-Cron-Secret',
      'x-internal-secret',
      'x-store-id',
    ],
    exposeHeaders: [
      'Content-Length',
      'ETag',
      'Cache-Tag',
    ],
    maxAge: 86400,
  });

  return corsMiddleware(c, next);
});

// 🏛️ مسارات المراقبة الخارجية
app.get('/ping', (c) => c.text('OK', 200));

// 🧪 Route مباشر لتجربة التنبيهات مع safeExecute والمسارات المعيارية
app.get('/api/test-error', (c) =>
  safeExecute(async () => {
    const internalSecret = c.env.INTERNAL_API_SECRET;
    const providedSecret = c.req.header('x-internal-secret');

    if (!internalSecret || providedSecret !== internalSecret) {
      throw new SystemError({
        code: 'UNAUTHORIZED_ACCESS',
        userMessage: 'غير مصرح للوصول إلى رابط الاختبار',
        technicalMessage: 'Provided internal secret does not match configuration',
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    // رمي خطأ معياري للتأكد من عمل نظام التنبيهات
    throw new SystemError({
      code: 'TEST_001',
      userMessage: 'تم رمي خطأ تجريبي للتأكد من عمل نظام التنبيهات',
      technicalMessage: 'Manual test error triggered for system notification verifications.',
      category: 'system',
      severity: 'info',
      retryable: false,
      shouldAlert: true,
      metadata: { env: 'test', path: c.req.path },
    });
  })
);

// Routes Mount
app.route('/api', healthRouter);
app.route('/api', storeRouter);
app.route('/api', categoriesRouter);
app.route('/api', productsRouter);
app.route('/api', ordersRouter);
app.route('/api', authRouter);
app.route('/api', telegramRouter);
app.route('/api', cronRouter);
app.route('/api', errorsRouter);
app.route('/api', cartRouter);
app.route('/api', couponsRouter);
app.route('/api', haggleRouter);
app.route('/api', snapshotRouter);
app.route('/api', testAlertsRouter);

// 🎯 Pass-through Fallback: تمرير باقي الطلبات إلى OpenNext
app.all('*', async (c) => {
  try {
    return await openNextHandler.fetch(c.req.raw, c.env, c.executionCtx);
  } catch (err) {
    console.error('❌ OpenNext Fetch Handler Error:', err);
    return c.text('Internal Server Error', 500);
  }
});

// 🚀 التصدير الموحد لطلبات الـ HTTP وتنفذيات الـ Cron أوتوماتيكياً
export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      Promise.allSettled([
        processBatchFlush(env, { batchSize: 200 }),
        processErrorQueue(env, { batchSize: 50 }),
      ])
    );
  },
};