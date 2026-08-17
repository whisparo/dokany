// tests/integration/live-telegram.test.ts
import { describe, it, expect } from 'vitest';
import { sendCriticalError, formatErrorForTelegram } from '@/lib/errors/clients/telegram';
import { SystemError } from '@/lib/errors';

describe('Live Telegram Direct Delivery', () => {
  it('should deliver critical error alert directly to Telegram channel', async () => {
    // 1. التوكن والقناة الحقيقيين
    const env = {
      ERROR_BOT_TOKEN: '8970153089:AAEMv5v878XZiLMz0E2I_cNqGRPr4tfH6Nw',
      ERROR_CHANNEL_ID: '-1003855373399',
    };

    // 2. إنشاء خطأ تجريبي بمواصفات المشرووع
    const testError = new SystemError({
      code: 'DIRECT_TEST_ERROR',
      userMessage: 'اختبار الإرسال المباشر للتليجرام من ملف التست',
      technicalMessage: 'Testing direct delivery without queue',
      category: 'system',
      severity: 'critical',
      retryable: false,
      shouldAlert: true,
    });

    // 3. التنسيق والإرسال المباشر
    const formattedText = formatErrorForTelegram(testError);
    const result = await sendCriticalError(env, formattedText);

    console.log('📬 RESULT FROM TELEGRAM:', result);

    // 4. التأكد من النجاح
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });
});