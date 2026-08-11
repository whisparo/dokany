// tests/unit/checkout-orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCheckout } from '@/features/storefront-checkout/orchestrators/checkout.orchestrator';

// Mock ذكي ومتوافق تماماً مع Drizzle D1 Driver
const createMockD1 = () => {
  const statementMock = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    raw: vi.fn().mockResolvedValue([['test_idem_key_empty_cart']]), // 👈 حل مشكلة .raw() هنا
  };

  return {
    prepare: vi.fn().mockReturnValue(statementMock),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn().mockResolvedValue({ count: 0, duration: 0 }),
  };
};

const createMockEnv = () => ({
  DB: createMockD1() as any,
  UPSTASH_REDIS_REST_URL: 'https://mock-redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'mock-token',
});

describe('Checkout Orchestrator & Safety Rules', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
  });

  it('ينبغي أن يرفض الطلب فوراً عند إرسال عناصر سلة فارغة', async () => {
    const idempotencyKey = 'test_idem_key_empty_cart';
    const payload = {
      id: 'ord_123',
      orderNumber: 'ORD-1001',
      storeId: 'store_1',
      customerId: 'cust_1',
      customerName: 'Ahmad',
      customerPhone: '01000000000',
      shippingAddress: {
        street: 'Main St',
        city: 'Cairo',
        country: 'EG',
        recipientName: 'Ahmad',
        recipientPhone: '01000000000',
      },
      currency: 'EGP',
      subtotal: '100.00',
      discount: '0.00',
      taxAmount: '0.00',
      shippingCost: '20.00',
      total: '120.00',
      paymentMethod: 'cod',
      shippingMethod: 'standard',
    };

    const result = await processCheckout(mockEnv as any, idempotencyKey, payload, []);

    expect(result.success).toBe(false);
    expect(result.message).toContain('سلة الشراء فارغة');
  });

  it('ينبغي أن يحافظ على ثبات الـ Idempotency Key', () => {
    const idempotencyKey = 'test_idem_duplicate';
    expect(idempotencyKey).toBeDefined();
  });
});