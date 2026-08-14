// src/workers/index.ts

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '@/lib/env';

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

// 🏛️ الاستيرادات المعتمدة والدقيقة للمشروع
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram, createTestErrorForNotifier } from '@/lib/errors/notifier';
import type { ErrorCategory } from '@/lib/errors/types';

// 🌐 استيراد الـ OpenNext Server Handler
// @ts-ignore
import openNextHandler from '../../.open-next/worker.js';

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
      // 1. السماح بالطلبات التي لا تحتوي Origin (مثل Server-to-Server أو Telegram Webhooks)
      if (!origin) return '*';

      // 2. مطابقة النطاقات الثابتة
      if (staticOrigins.includes(origin)) {
        return origin;
      }

      // 3. التحقق الديناميكي من النطاقات المخصصة والنطاقات الفرعية
      try {
        const url = new URL(origin);

        if (url.hostname.endsWith('.dokany.workers.dev')) {
          return origin;
        }

        if (c.env.CUSTOM_DOMAINS_KV) {
          // ⚡ L1 Worker Cache API للحصول على 0ms Latency بدلاً من استعلام KV في كل طلب
          const cache = caches.default;
          const cacheKey = new Request(`https://internal-cache/domain-check/${url.hostname}`);
          
          let response = await cache.match(cacheKey);

          if (!response) {
            const isCustomDomain = await c.env.CUSTOM_DOMAINS_KV.get(`domain:${url.hostname}`);
            const isValid = !!isCustomDomain;

            response = new Response(JSON.stringify({ valid: isValid }), {
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300', // 5 دقائق كاش على الـ Edge
              },
            });

            // حفظ النتيجة في الكاش بدون تعطيل الـ Execution Flow
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
      'X-Idempotency-Key',
      'X-Cron-Secret',
      'x-internal-secret',
      'x-store-id',
    ],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
  });

  return corsMiddleware(c, next);
});

// 🏛️ مسارات المراقبة الخارجية
app.get('/ping', (c) => c.text('OK', 200));

/**
 * 🛠️ Helper لاستخراج معرف شات الأخطاء بأمان من c.env مباشرة
 */
function resolveTelegramChatId(env: Env): string | undefined {
  return env.TELEGRAM_ERROR_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID || env.ERROR_CHANNEL_ID;
}

// 🧪 Route مباشر لتجربة التنبيهات (محمي بـ Internal Secret)
app.get('/api/test-error', async (c) => {
  const internalSecret = c.env.INTERNAL_API_SECRET;
  const providedSecret = c.req.header('x-internal-secret');

  if (internalSecret && providedSecret !== internalSecret) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const testError = createTestErrorForNotifier();
    const chatId = resolveTelegramChatId(c.env);

    const envWithFallback = {
      ...c.env,
      TELEGRAM_ERROR_CHAT_ID: chatId || '',
    };

    await sendErrorToTelegram(testError, envWithFallback);

    return c.json({
      success: true,
      message: '🚀 تم تنفيذ أمر الإرسال بنجاح!',
      debug: {
        hasBotToken: !!c.env.TELEGRAM_BOT_TOKEN,
        chatIdUsed: chatId,
        hasRedisUrl: !!c.env.UPSTASH_REDIS_REST_URL,
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'حدث خطأ أثناء إرسال التنبيه التجريبي';
    const errorStack = err instanceof Error ? err.stack : undefined;

    return c.json(
      {
        success: false,
        error: errorMessage,
        stack: errorStack,
      },
      500
    );
  }
});

/**
 * 🎯 تحديد الـ Status Code الدقيق وفق أنواع Hono
 */
function mapCategoryToStatusCode(category: ErrorCategory): ContentfulStatusCode {
  switch (category) {
    case 'validation':
      return 400;
    case 'security':
      return 401;
    case 'business':
      return 422;
    case 'network':
      return 503;
    case 'database':
    case 'performance':
    case 'system':
    default:
      return 500;
  }
}

// 🏛️ Global Error Handler التنفيذي المنسق مع notifier.ts
app.onError((err, c) => {
  const systemError = classifyError(err);

  const chatId = resolveTelegramChatId(c.env);
  const envWithFallback = {
    ...c.env,
    TELEGRAM_ERROR_CHAT_ID: chatId || '',
  };

  const enrichedContext = {
    ...systemError.context,
    path: c.req.path,
    method: c.req.method,
    ip: c.req.header('cf-connecting-ip') || '0.0.0.0',
  };

  const enrichedError = Object.assign(
    Object.create(Object.getPrototypeOf(systemError)),
    systemError,
    { context: enrichedContext }
  );

  c.executionCtx.waitUntil(
    sendErrorToTelegram(enrichedError, envWithFallback).catch((sendErr: unknown) => {
      console.error('❌ Failed to process error notification pipeline:', sendErr);
    })
  );

  const statusCode = mapCategoryToStatusCode(systemError.category);

  return c.json(
    {
      success: false,
      code: systemError.code,
      message: systemError.userMessage || 'حدث خطأ غير متوقع، يسعدنا مساعدتك.',
    },
    statusCode
  );
});

// Routes Mount (الخاصة بالباك إند)
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

// 🎯 Pass-through Fallback: تمرير باقي طلبات واجهة المستخدم إلى OpenNext
app.all('*', async (c) => {
  try {
    return await openNextHandler.fetch(c.req.raw, c.env, c.executionCtx);
  } catch (err) {
    console.error('❌ OpenNext Fetch Handler Error:', err);
    return c.text('Internal Server Error', 500);
  }
});

export default app;