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

// 🏛️ الاستيرادات المعتمدة والدقيقة للمشروع
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram, createTestErrorForNotifier } from '@/lib/errors/notifier';
import type { ErrorCategory } from '@/lib/errors/types';

// 🌐 استيراد الـ OpenNext Server Handler ليمرر له Hono باقي طلبات الفرونت إند
// @ts-ignore
import openNextHandler from '../../.open-next/worker.js';

const app = new Hono<{ Bindings: Env }>();

// Middlewares
app.use('*', logger());

// ⚡ 1. معالجة الـ Trailing Slash لمسارات الباك إند فقط لمنع الـ Redirect Loop مع Next.js
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  const isBackendRoute = url.pathname.startsWith('/api') || url.pathname.startsWith('/ping');

  if (isBackendRoute && url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
    return c.redirect(url.toString(), 301);
  }
  await next();
});

// ⚡ 2. Dynamic CORS Origin Resolution (Task 2.1)
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

      // 2. مطابقة النطاقات الثابتة والتطويرية
      if (staticOrigins.includes(origin)) {
        return origin;
      }

      // 3. التحقق الديناميكي من نطاقات المتاجر المخصصة (Subdomains / Custom Domains)
      try {
        const url = new URL(origin);

        // السماح بنطاقات المتاجر الفرعية الثابتة على المنصة
        if (url.hostname.endsWith('.dokany.workers.dev')) {
          return origin;
        }

        // استخدام KV المخصص للمتاجر إذا كان معرّفاً في c.env
        if (c.env.CUSTOM_DOMAINS_KV) {
          const isCustomDomain = await c.env.CUSTOM_DOMAINS_KV.get(`domain:${url.hostname}`);
          if (isCustomDomain) {
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

// 🏛️ مسارات المراقبة الخارجية (Uptime Robot Check)
app.get('/ping', (c) => c.text('OK', 200));

/**
 * 🛠️ Helper لاستخراج معرف شات الأخطاء بأمان من c.env مباشرة
 */
function resolveTelegramChatId(env: Env): string | undefined {
  return env.TELEGRAM_ERROR_CHAT_ID || env.TELEGRAM_ADMIN_CHAT_ID || env.ERROR_CHANNEL_ID;
}

// 🧪 Route مباشر لتجربة التنبيهات مع فحص البيئة (Debug Mode)
app.get('/api/test-error', async (c) => {
  try {
    const testError = createTestErrorForNotifier();
    const chatId = resolveTelegramChatId(c.env);

    const envWithFallback = {
      ...c.env,
      TELEGRAM_ERROR_CHAT_ID: chatId || '',
    };

    // إرسال كارت التنبيه
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
  // 1. تصنيف الخطأ وتحويله إلى SystemError الموحد
  const systemError = classifyError(err);
  const chatId = resolveTelegramChatId(c.env);

  const envWithFallback = {
    ...c.env,
    TELEGRAM_ERROR_CHAT_ID: chatId || '',
  };

  // 2. استدعاء المبلّغ المركزي
  c.executionCtx.waitUntil(
    sendErrorToTelegram(systemError, envWithFallback).catch((sendErr: unknown) => {
      console.error('❌ Failed to process error notification pipeline:', sendErr);
    })
  );

  // 3. تحديد HTTP Status Code بحسب نوع الخطأ
  const statusCode = mapCategoryToStatusCode(systemError.category);

  // 4. إرجاع الرد الموحد والنظيف للمستخدم
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

// 🎯 3. Pass-through Fallback: أي مسار غير معرف في Hono يروح لـ Next.js مباشرة
app.all('*', async (c) => {
  return openNextHandler.fetch(c.req.raw, c.env, c.executionCtx);
});

export default app;