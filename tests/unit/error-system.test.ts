//tests/unit/error-system.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ERROR_CODES } from '@/lib/errors/codes';
import { sanitizeContext } from '@/lib/errors/sanitizer';
import { classifyError } from '@/lib/errors/classifier';
import { safeExecute } from '@/lib/errors/safe-executor';
import { saveErrorToR2 } from '@/lib/errors/storage';
import { SystemError } from '@/lib/errors/types';

describe('🏛️ الدستور النهائي لنظام الأخطاء - Unit Tests Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. اختبار سجل الأكواد والتصنيف (Codes & Classifier)
  describe('1️⃣ Registry & Classifier - سجل الأكواد والمُصنف', () => {
    it('يجب أن يستخرج كود الخطأ والبيانات الموجهة للمستخدم بشكل صحيح', () => {
      const rawError = new Error('Database connection failed');
      const systemError = classifyError(rawError, 'DB_001');

      expect(systemError).toBeInstanceOf(SystemError);
      expect(systemError.code).toBe('DB_001');
      expect(systemError.severity).toBe(ERROR_CODES.DB_001.severity);
      expect(systemError.userMessage).toBe(ERROR_CODES.DB_001.userMessage);
    });

    it('يجب أن يتعامل مع الأخطاء غير المعروفة ويصنفها كـ UNKNOWN_ERROR تلقائياً', () => {
      const systemError = classifyError('String exception error');

      expect(systemError.code).toBe('SYS_500');
      expect(systemError.severity).toBe('CRITICAL');
    });
  });

  // 2. اختبار المُنقي (Sanitizer)
  describe('2️⃣ Sanitizer - تنقية الحساسيات', () => {
    it('يجب أن يحذف الكلمات الحساسة مثل password و token من السياق', () => {
      const dirtyContext = {
        userId: 'user-123',
        password: 'SuperSecretPassword123!',
        authToken: 'bearer-xyz-abc',
        nested: {
          creditCard: '4111222233334444',
          validKey: 'KeepThis',
        },
      };

      const cleanContext = sanitizeContext(dirtyContext);

      expect(cleanContext.password).toBe('[REDACTED]');
      expect(cleanContext.authToken).toBe('[REDACTED]');
      expect(cleanContext.nested.creditCard).toBe('[REDACTED]');
      expect(cleanContext.nested.validKey).toBe('KeepThis');
      expect(cleanContext.userId).toBe('user-123');
    });
  });

  // 3. اختبار المنفذ الآمن ورصد الأداء (Safe Executor & Performance Sentry)
  describe('3️⃣ Safe Executor & Performance Sentry - المنفذ الآمن وحارس الأداء', () => {
    it('يجب أن يعيد النتيجة بنجاح للعمليات السليمة', async () => {
      const successfulTask = vi.fn().mockResolvedValue('Success Value');

      const result = await safeExecute({
        fn: successfulTask,
        code: 'BIZ_001',
      });

      expect(result.data).toBe('Success Value');
      expect(result.error).toBeNull();
    });

    it('يجب أن ينفذ الـ Fallback والـ Retries عند فشل العملية القابلة للمحاولة', async () => {
      const failingTask = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary Network Drop'))
        .mockResolvedValueOnce('Recovered Value');

      const result = await safeExecute({
        fn: failingTask,
        code: 'NET_001',
        retries: 1,
        fallback: 'Fallback Value',
      });

      expect(failingTask).toHaveBeenCalledTimes(2);
      expect(result.data).toBe('Recovered Value');
    });

    it('يجب أن يعيد الـ Fallback في حال فشل جميع المحاولات', async () => {
      const alwaysFailingTask = vi.fn().mockRejectedValue(new Error('Fatal DB Crash'));

      const result = await safeExecute({
        fn: alwaysFailingTask,
        code: 'DB_001',
        retries: 1,
        fallback: 'Default Fallback Data',
      });

      expect(result.data).toBe('Default Fallback Data');
      expect(result.error).not.toBeNull();
      expect(result.error?.code).toBe('DB_001');
    });
  });

  // 4. اختبار التخزين الفوري في R2 (Immediate Storage)
  describe('4️⃣ Immediate Storage - الكتابة الفورية في R2', () => {
    it('يجب أن يكتب ملف JSON في R2 Bucket بنفس التنسيق المحدد في الدستور', async () => {
      const mockBucket = {
        put: vi.fn().mockResolvedValue({}),
      };

      const testError = new SystemError({
        code: 'DB_001',
        message: 'D1 Connection Interrupted',
        severity: 'CRITICAL',
        category: 'database',
        userMessage: 'عذراً، حدث خطأ أثناء الاتصال',
      });

      await saveErrorToR2(testError, mockBucket as any, {
        correlationId: 'test-trace-id-123',
      });

      expect(mockBucket.put).toHaveBeenCalledTimes(1);
      
      const [fileName, fileContent] = mockBucket.put.mock.calls[0];
      
      expect(fileName).toMatch(/^errors\/raw\/\d{4}-\d{2}-\d{2}\/error_/);
      
      const parsedData = JSON.parse(fileContent as string);
      expect(parsedData.code).toBe('DB_001');
      expect(parsedData.correlationId).toBe('test-trace-id-123');
      expect(parsedData.severity).toBe('CRITICAL');
    });
  });
});