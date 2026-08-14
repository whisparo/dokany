// tests/unit/order-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generateOrderNumber, 
  prepareOrderItems, 
  calculateOrderTotals, 
  createOrder, 
  createOrderItems 
} from '@/lib/services/order-service';
import { updateStock, type StockUpdateItem } from '@/lib/services/inventory-service';
import { SystemError } from '@/lib/errors/types';
import type { D1Transaction } from '@/lib/db';

// Mock لـ D1Transaction
const createMockTx = () => {
  const returningMock = vi.fn();
  const valuesMock = vi.fn(() => ({ returning: returningMock }));
  const setMock = vi.fn(() => ({
    where: vi.fn(() => ({ returning: returningMock })),
  }));

  return {
    insert: vi.fn(() => ({ values: valuesMock })),
    update: vi.fn(() => ({ set: setMock })),
    _returningMock: returningMock,
    _valuesMock: valuesMock,
    _setMock: setMock,
  } as unknown as D1Transaction & {
    _returningMock: ReturnType<typeof vi.fn>;
    _valuesMock: ReturnType<typeof vi.fn>;
    _setMock: ReturnType<typeof vi.fn>;
  };
};

describe('OrderService Tests', () => {
  let mockTx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx = createMockTx();
  });

  describe('generateOrderNumber', () => {
    it('يجب أن يولد رقم طلب بالتنسيق الصحيح (ORD-XXXXX-XXXX)', () => {
      const orderNum = generateOrderNumber();
      expect(orderNum).toMatch(/^ORD-[A-Z0-9]+-\d{4}$/);
    });
  });

  describe('prepareOrderItems', () => {
    it('يجب أن يحسب الحقول والخيارات بشكل صحيح وتثبيت storeId', () => {
      const rawItems = [
        {
          productId: 'prod-1',
          variantSku: 'SKU-V1',
          productName: 'منتج تجريبي',
          productSku: 'SKU-P1',
          orderedQty: 2,
          price: '100.00',
        },
      ];

      const prepared = prepareOrderItems(rawItems, 'store-123');

      expect(prepared).toHaveLength(1);
      expect(prepared[0]).toMatchObject({
        storeId: 'store-123',
        productId: 'prod-1',
        orderedQty: 2,
        price: '100.00',
      });
      expect(prepared[0].lineTotal).toBeDefined();
    });
  });

  describe('calculateOrderTotals', () => {
    it('يجب أن يحسب المجاميع بصيغة مقربة بخانتين عشريتين', () => {
      const totals = calculateOrderTotals({
        subtotal: 100.5,
        shippingCost: 15.25,
        taxAmount: 14,
        discount: 10,
      });

      expect(totals).toEqual({
        subtotal: '100.50',
        shippingCost: '15.25',
        taxAmount: '14.00',
        discount: '10.00',
        total: '119.75',
      });
    });
  });

  describe('createOrder', () => {
    it('يجب أن يرمي SystemError بكود ORD_400 في حال عدم وجود البيانات الأساسية', async () => {
      const invalidOrderData: any = { storeId: '' };

      await expect(createOrder(invalidOrderData, mockTx)).rejects.toThrow(SystemError);
      await expect(createOrder(invalidOrderData, mockTx)).rejects.toMatchObject({
        code: 'ORD_400',
      });
    });

    it('يجب أن ينشئ الطلب بنجاح ويرجع الكائن المحفوظ', async () => {
      const mockCreatedOrder = { id: 'order-1', storeId: 'store-1', customerId: 'cust-1' };
      mockTx._returningMock.mockResolvedValueOnce([mockCreatedOrder]);

      const orderData: any = { storeId: 'store-1', customerId: 'cust-1' };
      const result = await createOrder(orderData, mockTx);

      expect(result).toEqual(mockCreatedOrder);
    });
  });

  describe('createOrderItems', () => {
    it('يجب أن يعيد مصفوفة فارغة إذا كانت العناصر فارغة', async () => {
      const result = await createOrderItems('order-1', [], mockTx);
      expect(result).toEqual([]);
    });

    it('يجب أن ينشئ عناصر الطلب بنجاح', async () => {
      const mockItems = [{ id: 'item-1', orderId: 'order-1' }];
      mockTx._returningMock.mockResolvedValueOnce(mockItems);

      const itemsToInsert: any = [
        { productId: 'p-1', price: '10.00', orderedQty: 1 },
      ];

      const result = await createOrderItems('order-1', itemsToInsert, mockTx);
      expect(result).toEqual(mockItems);
    });
  });
});

describe('InventoryService Tests', () => {
  let mockTx: ReturnType<typeof createMockTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx = createMockTx();
  });

  describe('updateStock', () => {
    it('يجب أن لا ينفذ شيئاً إذا كانت المصفوفة فارغة', async () => {
      await updateStock([], mockTx);
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it('يجب أن يرمي SystemError بكود INV_400 إذا لم تكن الكمية متوفرة بالمخزن', async () => {
      mockTx._returningMock.mockResolvedValueOnce([]); // لم يرجع أي سجل تحديث

      const items: StockUpdateItem[] = [
        { productId: 'p-1', quantity: 5 },
      ];

      await expect(updateStock(items, mockTx)).rejects.toThrow(SystemError);
      await expect(updateStock(items, mockTx)).rejects.toMatchObject({
        code: 'INV_400',
      });
    });

    it('يجب أن يحدث المخزون بنجاح عند توفر الكمية', async () => {
      mockTx._returningMock.mockResolvedValueOnce([{ id: 'p-1', stock: 10 }]);

      const items: StockUpdateItem[] = [
        { productId: 'p-1', quantity: 2 },
      ];

      await expect(updateStock(items, mockTx)).resolves.not.toThrow();
    });
  });
});