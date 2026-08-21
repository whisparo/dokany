// src/worker/routes/errors.ts

import { Hono } from 'hono';
import type { Env } from '../../src/lib/env';
import { safeExecute, SystemError } from '../../src/lib/errors';

export const errorsRouter = new Hono<{ Bindings: Env }>();

errorsRouter.get('/errors/test-telegram', (c) =>
  safeExecute(async () => {
    // 1. تجهيز بيئة تليجرام للتأكد من المكونات
    const telegramEnv = {
      ERROR_BOT_TOKEN: c.env.ERROR_BOT_TOKEN,
      ERROR_CHANNEL_ID: c.env.ERROR_CHANNEL_ID || '-1003855373399',
    };

    // 2. إنشاء خطأ اختبار مطبق عليه بنية SystemError القياسية
    const testError = new SystemError({
      code: 'SYSTEM_HEALTH_CHECK',
      userMessage: 'اختبار الإرسال المباشر وتخزين B2',
      technicalMessage: 'Testing error endpoint delivery and B2 storage integration',
      category: 'system',
      severity: 'critical',
      retryable: false,
      shouldAlert: true,
      storeId: 'test-store-999',
      metadata: {
        path: c.req.path,
        source: 'telegram-test-endpoint',
        userId: 'test-user-123',
      },
    });

    // 3. كتابة الخطأ بـ B2 وتمرير الـ Key المولد للـ Queue
    let b2Saved = false;
    let generatedKey = '';
    try {
      const { createB2StoreFromEnv, B2Store, enqueueErrorKey } = await import('../../src/lib/errors/storage');
      const b2Store = createB2StoreFromEnv(c.env as unknown as Record<string, string | undefined>);
      
      generatedKey = B2Store.createErrorKey();
      await b2Store.write({
        content: testError,
        key: generatedKey,
        compress: true,
        enqueue: false,
      });

      // إضافة الـ Key المولد حقيقة للـ Redis Queue
      await enqueueErrorKey(c.env, generatedKey);
      b2Saved = true;
    } catch (storageError) {
      console.error('[Test Route] Failed to save test error to B2:', storageError);
    }

    // 4. إرسال التنبيه المباشر عبر تليجرام
    const { sendCriticalError, formatErrorForTelegram } = await import('../../src/lib/errors/clients/telegram');
    const formattedText = formatErrorForTelegram(testError);
    const result = await sendCriticalError(telegramEnv, formattedText);

    if (!result.success) {
      throw new SystemError({
        code: 'TELEGRAM_DELIVERY_FAILED',
        userMessage: 'فشل إرسال التنبيه عبر تليجرام',
        technicalMessage: `Telegram Delivery Failed: ${result.errorMessage} (Code: ${result.errorCode})`,
        category: 'system',
        severity: 'critical',
        retryable: true,
        shouldAlert: false,
        storeId: 'test-store-999',
        metadata: {
          path: c.req.path,
          errorCode: result.errorCode,
        },
      });
    }

    return c.json({
      ok: true,
      message: 'Telegram test alert sent and Error stored successfully',
      b2Saved,
      generatedKey,
      telegramResult: result,
    });
  })
);