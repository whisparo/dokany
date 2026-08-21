// src/workers/routes/health.ts

import { Hono } from 'hono';
import type { AppEnv } from '../../src/lib/env';
import { getDb } from '../../src/lib/db';
import { sql } from 'drizzle-orm';
import { safeExecute, SystemError } from '../../src/lib/errors';

export const healthRouter = new Hono<AppEnv>();

const APP_VERSION = '0.1.0';

/**
 * GET /api/health
 */
healthRouter.get('/health', (c) =>
  safeExecute(async () => {
    const isDevelopment =
      c.env.NEXT_PUBLIC_APP_URL?.includes('localhost') ?? false;
    const correlationId =
      c.req.header('x-correlation-id') || crypto.randomUUID();

    // فحص حيوي سريع لاتصال قاعدة البيانات D1
    try {
      const db = getDb({ DB: c.env.DB });
      await db.run(sql`SELECT 1`);
    } catch {
      throw new SystemError({
        code: 'DATABASE_ERROR',
        category: 'database',
        severity: 'critical',
        userMessage: 'فشل الاتصال بقاعدة البيانات.',
        technicalMessage: 'D1 Health check query failed.',
        shouldAlert: false,
      });
    }

    return c.json(
      {
        success: true,
        data: {
          status: 'ok',
          database: 'ok',
          timestamp: new Date().toISOString(),
          worker: 'dokany-api',
          environment: isDevelopment ? 'development' : 'production',
          version: APP_VERSION,
          correlationId,
        },
      },
      200
    );
  })
);