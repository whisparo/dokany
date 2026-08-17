// src/workers/routes/cron.ts

import { Hono } from 'hono';
import type { AppEnv } from '@/lib/env';
import { safeExecute, SystemError } from '@/lib/errors';
import { processErrorQueue } from '@/lib/errors/background/processor';

export const cronRouter = new Hono<AppEnv>();

/**
 * دالة مقارنة آمنة زمنياً لمقاومة Timing Attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  let mismatch = 0;
  for (let i = 0; i < aBuf.length; i++) {
    mismatch |= aBuf[i] ^ bBuf[i];
  }
  return mismatch === 0;
}

/**
 * 🚀 POST /cron/process-errors
 */
cronRouter.post('/cron/process-errors', (c) =>
  safeExecute(
    async () => {
      // 1. التحقق من أسرار التشغيل
      const clientSecret =
        c.req.header('X-Cron-Secret') || c.req.header('x-internal-secret') || '';

      const validSecrets = [
        c.env.CRON_SECRET,
        c.env.QSTASH_TOKEN,
        c.env.INTERNAL_API_SECRET,
      ].filter((s): s is string => typeof s === 'string' && s.length > 0);

      if (validSecrets.length === 0) {
        throw new SystemError({
          code: 'INTERNAL_ERROR',
          category: 'system',
          severity: 'critical',
          userMessage: 'خطأ في إعدادات الخادم.',
          technicalMessage: 'No valid cron secret configured in environment variables.',
          shouldAlert: true,
          metadata: { path: c.req.path },
        });
      }

      if (!clientSecret || !validSecrets.some((secret) => safeCompare(clientSecret, secret))) {
        throw new SystemError({
          code: 'UNAUTHORIZED',
          category: 'security',
          severity: 'warning',
          userMessage: 'غير مصرح للوصول إلى هذا المسار.',
          technicalMessage: 'Invalid or missing Cron Secret header in request.',
          metadata: { path: c.req.path },
        });
      }

      // 2. معالجة الدفعة مع ترك أي استثناء لـ safeExecute
      const result = await processErrorQueue(c.env, {
        batchSize: 50,
      });

      return c.json(
        {
          success: true,
          message: 'Error processing completed successfully.',
          data: result,
        },
        200
      );
    },
    { operationName: 'cron_process_errors' }
  )
);