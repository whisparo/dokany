// tests/unit/inventory-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  updateStock, 
  reserveStockAtomic, 
  syncStockFromD1ToRedis 
} from '@/lib/services/inventory-service';

// Mock لخدمة التنبيهات حتى لا ترسل إشعارات حقيقية أثناء الاختبار
vi.mock('@/lib/services/alert-service', () => ({
  AlertService: {
    notifyLowStock: vi.fn(),
    notifyFallbackActivated: vi.fn(),
    notifyCompensation: vi.fn(),
    notifyCriticalFailure: vi.fn(),
  },
}));

describe('Inventory Service - Unit & Resilience Tests', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // 1️⃣ اختبارات updateStock المباشرة (D1 Transaction)
  // ============================================================
  describe('updateStock', () => {
    it('خصم الكميات بنجاح عند وجود رصيد كافٍ للمنتجات', async () => {
      const chainable = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'prod-1', stock: 8 }]),
        then: vi.fn().mockImplementation((cb) => Promise.resolve([{ id: 'prod-1', stock: 8 }]).then(cb)),
      };

      const mockTx = {
        update: vi.fn().mockReturnValue(chainable),
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 'prod-1' }], success: true }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      const itemsToDeduct = [{ productId: 'prod-1', quantity: 2 }];
      await expect(updateStock(itemsToDeduct, mockTx as any)).resolves.not.toThrow();
    });

    it('تجاهل تنفيذ الخصم وإرجاع القيمة فوراً إذا كانت القائمة فارغة', async () => {
      const mockTx = { update: vi.fn(), execute: vi.fn(), run: vi.fn() };
      
      await updateStock([], mockTx as any);

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.execute).not.toHaveBeenCalled();
    });

    it('خصم الكميات لمنتجات متعددة دفعة واحدة في نفس المعاملة (Batch Update)', async () => {
      const chainable = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'mock-id', stock: 5 }]),
        then: vi.fn().mockImplementation((cb) => Promise.resolve([{ id: 'mock-id', stock: 5 }]).then(cb)),
      };

      const mockTx = {
        update: vi.fn().mockReturnValue(chainable),
        execute: vi.fn().mockResolvedValue({ rows: [{ id: 'mock-id' }], success: true }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };

      const itemsToDeduct = [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 5 },
      ];

      await updateStock(itemsToDeduct, mockTx as any);
      expect(mockTx.update).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // 2️⃣ اختبارات reserveStockAtomic والـ Failover
  // ============================================================
  describe('reserveStockAtomic & Failover', () => {
    it('رفض الطلب فوراً إذا كانت الكمية المطلوبة أقل من أو تساوي صفر', async () => {
      const mockEnv = {} as any;
      const result = await reserveStockAtomic('prod-1', 0, 'store-1', mockEnv);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid_request');
    });

    it('التحول التلقائي إلى D1 Fallback عند غياب إعدادات Redis', async () => {
      // Mock متوافق مع Drizzle D1 Adapter
      const mockStatement = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          success: true,
          results: [{ stock: 4 }],
        }),
        raw: vi.fn().mockResolvedValue([
          [4] // Drizzle raw query result
        ]),
        first: vi.fn().mockResolvedValue({ stock: 4 }),
        run: vi.fn().mockResolvedValue({
          success: true,
          meta: { changes: 1 },
        }),
      };

      const mockD1Client = {
        prepare: vi.fn().mockReturnValue(mockStatement),
        dump: vi.fn(),
        batch: vi.fn().mockResolvedValue([]),
        exec: vi.fn(),
      };

      const mockEnv = {
        DB: mockD1Client,
      } as any;

      const result = await reserveStockAtomic('prod-1', 1, 'store-1', mockEnv);

      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(true);
      expect(result.newStock).toBe(4);
    });
  });
});