// src/workers/routes/health.ts

import { Hono } from 'hono';
import type { Env } from '@/lib/env';

/**
 * 🏥 Health Router
 * 
 * مسؤول عن:
 * - `/api/health` → فحص صحة الـ Worker وسرعة الاستجابة
 */
export const healthRouter = new Hono<{ Bindings: Env }>();

const APP_VERSION = '0.1.0';

/**
 * GET /api/health
 */
healthRouter.get('/health', (c) => {
  // c.env معرف أوتوماتيكياً بـ Type-Safe بفضل Bindings
  const isDevelopment = c.env.NEXT_PUBLIC_APP_URL?.includes('localhost') ?? false;
  const correlationId = c.req.header('x-correlation-id') || crypto.randomUUID();

  return c.json(
    {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        worker: 'dokany-api',
        environment: isDevelopment ? 'development' : 'production',
        version: APP_VERSION,
        correlationId,
      },
    },
    200
  );
});