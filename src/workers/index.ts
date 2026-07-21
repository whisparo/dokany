// src/workers/index.ts

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Env } from '../lib/env';

// Routes
import { healthRouter } from './routes/health';
import { storeRouter } from './routes/store';
import { categoriesRouter } from './routes/categories';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';
import { authRouter } from './routes/auth';
import { telegramRouter } from './routes/telegram';

// 🏛️ الاستيرادات المعتمدة والدقيقة للمشروع
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import { ErrorCategory } from '@/lib/errors/types';

const app = new Hono<{ Bindings: Env }>();

// Middlewares
app.use('*', logger());
app.use('*', cors({
  origin: ['https://dokany.pages.dev', 'https://dokany-web.pages.dev', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

// 🏛️ مسار المراقبة الخارجية (Uptime Robot Check)
app.get('/ping', (c) => c.text('OK', 200));

/**
 * 🎯 تحديد الـ Status Code الدقيق وفق أنواع Hono بدون الحاجة لـ Casting
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

  // 2. استدعاء المبلّغ المركزي (يتولى الحفظ في B2 + الفحص + تليجرام في الخلفية)
  c.executionCtx.waitUntil(
    sendErrorToTelegram(systemError, c.env).catch((sendErr: unknown) => {
      console.error('❌ Failed to process error notification pipeline:', sendErr);
    })
  );

  // 3. تحديد HTTP Status Code بحسب نوع الخطأ
  const statusCode = mapCategoryToStatusCode(systemError.category);

  // 4. إرجاع الرد الموحد والنظيف للمستخدم (Strict Type-Safe)
  return c.json(
    {
      success: false,
      code: systemError.code,
      message: systemError.userMessage || 'حدث خطأ غير متوقع، يسعدنا مساعدتك.',
    },
    statusCode
  );
});

// Routes Mount
app.route('/api', healthRouter);
app.route('/api', storeRouter);
app.route('/api', categoriesRouter);
app.route('/api', productsRouter);
app.route('/api', ordersRouter);
app.route('/api', authRouter);
app.route('/api', telegramRouter);

export default app;