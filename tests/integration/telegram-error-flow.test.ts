// tests/integration/processor-telegram.test.ts
import { describe, it, expect } from 'vitest';
import { processErrorQueue, type ProcessorEnv } from '@/lib/errors/background/processor';

describe('Background Error Queue & Telegram Pipeline', () => {
  it('should process error queue and trigger telegram digest/alerts', async () => {
    // 1. إعداد البيئة الموحدة
    const testEnv: ProcessorEnv = {
      TELEGRAM_BOT_TOKEN: '8970153089:AAEMv5v878XZiLMz0E2I_cNqGRPr4tfH6Nw',
      TELEGRAM_ERROR_CHAT_ID: '-1003855373399',
      // ضف هنا بيانات B2 و Redis التجريبية لو محتاجها الـ Queue
    };

    // 2. استدعاء المعالج الخلفي
    const batchResult = await processErrorQueue(testEnv, {
      batchSize: 10,
      sendAlerts: true,
      deleteAfterProcessing: false, // للحفاظ على البيانات أثناء الاختبار
      serviceName: 'test-runner',
    });

    // 3. التحقق من ناتج المعالجة
    expect(batchResult).toBeDefined();
    expect(typeof batchResult.totalProcessed).toBe('number');
  });
});