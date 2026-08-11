// tests/unit/store-stats.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateStoreStatsAfterOrder,
  updateCustomerStats,
  updateProductStatsBatch,
} from '@/lib/services/store-stats';
import { Redis } from '@upstash/redis';

// إنشاء mock instance موحد للدالة del
const mockDel = vi.fn().mockResolvedValue(1);

// Mock صح للـ Redis Class
vi.mock('@upstash/redis', () => {
  return {
    Redis: vi.fn().mockImplementation(function (this: any) {
      this.del = mockDel;
      return this;
    }),
  };
});

// Mock لـ getDb
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

describe('Store Stats Service Tests', () => {
  const mockEnv = {
    UPSTASH_REDIS_REST_URL: 'https://fake-redis.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'fake-token',
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDel.mockResolvedValue(1);
  });

  // -------------------------------------------------------
  // 1. updateStoreStatsAfterOrder Tests
  // -------------------------------------------------------
  describe('updateStoreStatsAfterOrder', () => {
    it('يجب أن يحدث إحصائيات المتجر الموجودة ويزيل الكاش من Redis', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'stats-1' }]),
            }),
          }),
        }),
      } as any;

      await updateStoreStatsAfterOrder(mockEnv, 'store-1', '150.00', mockTx);

      expect(mockTx.update).toHaveBeenCalled();
      expect(mockDel).toHaveBeenCalledWith('cache:store-stats:store-1');
    });

    it('يجب أن ينشئ سطر جديد إذا لم تكن هناك إحصائيات سابقة للمتجر (Fallback Insert)', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // لا يوجد سطر محدث
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue({}),
        }),
      } as any;

      await updateStoreStatsAfterOrder(mockEnv, 'store-1', '100.00', mockTx);

      expect(mockTx.update).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('يجب أن يرمي SystemError برمز STA_501 عند حدوث خطأ في قاعدة البيانات', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue(new Error('D1 Connection error')),
            }),
          }),
        }),
      } as any;

      await expect(
        updateStoreStatsAfterOrder(mockEnv, 'store-1', '100.00', mockTx)
      ).rejects.toMatchObject({
        code: 'STA_501',
        retryable: true,
      });
    });
  });

  // -------------------------------------------------------
  // 2. updateCustomerStats Tests
  // -------------------------------------------------------
  describe('updateCustomerStats', () => {
    it('يجب أن يحدث إحصائيات العميل بأسلوب التحديث المباشر', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'cust-stats-1' }]),
            }),
          }),
        }),
      } as any;

      await updateCustomerStats(mockEnv, 'cust-123', '250.00', mockTx);

      expect(mockTx.update).toHaveBeenCalled();
    });

    it('يجب أن ينشئ سجل إحصائيات جديد للعميل إذا كان طلبه الأول', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue({}),
        }),
      } as any;

      await updateCustomerStats(mockEnv, 'cust-new', '50.00', mockTx);

      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('يجب أن يرمي SystemError برمز STA_502 عند فشل التحديث', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue(new Error('Database lock timeout')),
            }),
          }),
        }),
      } as any;

      await expect(
        updateCustomerStats(mockEnv, 'cust-1', '50.00', mockTx)
      ).rejects.toMatchObject({
        code: 'STA_502',
      });
    });
  });

  // -------------------------------------------------------
  // 3. updateProductStatsBatch Tests
  // -------------------------------------------------------
  describe('updateProductStatsBatch', () => {
    it('يجب ألا ينفذ أي شيء إذا كانت مصفوفة المنتجات فارغة', async () => {
      const mockTx = {
        update: vi.fn(),
      } as any;

      await updateProductStatsBatch(mockEnv, [], mockTx);

      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it('يجب أن يحدث إحصائيات مبيعات منتجات متعدده دفعة واحدة ويلغي الكاش الخاص بها', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'prod-stats-1' }]),
            }),
          }),
        }),
      } as any;

      const items = [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ];

      await updateProductStatsBatch(mockEnv, items, mockTx);

      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(mockDel).toHaveBeenCalledWith(
        'cache:product-stats:p1',
        'cache:product-stats:p2'
      );
    });

    it('يجب أن يرمي SystemError برمز STA_503 عند حدوث خطأ أثناء التحديث الدفعي', async () => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockRejectedValue(new Error('Batch update error')),
            }),
          }),
        }),
      } as any;

      await expect(
        updateProductStatsBatch(mockEnv, [{ productId: 'p1', quantity: 1 }], mockTx)
      ).rejects.toMatchObject({
        code: 'STA_503',
      });
    });
  });

  // -------------------------------------------------------
  // 4. Redis Cache Invalidation Edge Cases
  // -------------------------------------------------------
  describe('Redis Cache Invalidation Edge Cases', () => {
    it('يجب ألا يفشل أو يرمي خطأ إذا فشل الاتصال بالـ Redis', async () => {
      mockDel.mockRejectedValueOnce(new Error('Redis Timeout'));

      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'stats-1' }]),
            }),
          }),
        }),
      } as any;

      await expect(
        updateStoreStatsAfterOrder(mockEnv, 'store-1', '100.00', mockTx)
      ).resolves.not.toThrow();
    });
  });
});