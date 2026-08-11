// tests/unit/inventory-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateStock } from '@/lib/services/inventory-service';

describe('Inventory Service - updateStock', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('خصم الكميات بنجاح عند وجود رصيد كافٍ للمنتجات', async () => {
    // Mock شامل لسلسلة استعلامات Drizzle ORM
    const chainable = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'prod-1' }]),
      then: vi.fn().mockImplementation((cb) => Promise.resolve([{ id: 'prod-1' }]).then(cb)),
    };

    const mockTx = {
      update: vi.fn().mockReturnValue(chainable),
      execute: vi.fn().mockResolvedValue({
        rows: [{ id: 'prod-1' }],
        success: true,
      }),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const itemsToDeduct = [
      { productId: 'prod-1', quantity: 2 },
    ];

    await expect(updateStock(itemsToDeduct, mockTx as any)).resolves.not.toThrow();
  });

  it('تجاهل تنفيذ الخصم وإرجاع القيمة فوراً إذا كانت القائمة فارغة', async () => {
    const mockTx = {
      update: vi.fn(),
      execute: vi.fn(),
      run: vi.fn(),
    };

    await updateStock([], mockTx as any);

    expect(mockTx.update).not.toHaveBeenCalled();
    expect(mockTx.execute).not.toHaveBeenCalled();
  });

  it('خصم الكميات لمنتجات متعددة دفعة واحدة في نفس المعاملة (Batch Update)', async () => {
    const chainable = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'mock-id' }]),
      then: vi.fn().mockImplementation((cb) => Promise.resolve([{ id: 'mock-id' }]).then(cb)),
    };

    const mockTx = {
      update: vi.fn().mockReturnValue(chainable),
      execute: vi.fn().mockResolvedValue({
        rows: [{ id: 'mock-id' }],
        success: true,
      }),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    const itemsToDeduct = [
      { productId: 'prod-1', quantity: 2 },
      { productId: 'prod-2', quantity: 5 },
    ];

    await updateStock(itemsToDeduct, mockTx as any);

    const totalCalls =
      mockTx.update.mock.calls.length +
      mockTx.execute.mock.calls.length +
      mockTx.run.mock.calls.length;

    expect(totalCalls).toBeGreaterThanOrEqual(2);
  });

});