// tests/unit/rate-limiter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, buildRateLimitKey, resetRateLimit, peekRateLimit } from '@/lib/rate-limit';
import type { Redis } from '@upstash/redis';

describe('Security - Rate Limiter', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('التحقق من وجود دوال وحدة الـ Rate Limiting بحالة سليمة', () => {
    expect(checkRateLimit).toBeDefined();
    expect(buildRateLimitKey).toBeDefined();
    expect(resetRateLimit).toBeDefined();
    expect(peekRateLimit).toBeDefined();
  });

  it('السماح بالطلبات عند وجود ذاكرة مؤقتة ضمن الحد المسموح', async () => {
    // محاكاةUpstash Redis بحيث تعيد [العدد الحالي, TTL المتبقي]
    const mockRedis = {
      eval: vi.fn().mockResolvedValue([2, 50]),
    } as unknown as Redis;

    const result = await checkRateLimit(mockRedis, 'test-key', 5, 60);

    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(2);
    expect(result.remaining).toBe(3);
    expect(result.limit).toBe(5);
  });

  it('التعامل مع أول طلب للعميل (First Request)', async () => {
    const mockRedis = {
      eval: vi.fn().mockResolvedValue([1, 60]),
    } as unknown as Redis;

    const result = await checkRateLimit(mockRedis, 'ip-new', 10, 60);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.remaining).toBe(9);
  });

  it('منع الطلبات عند تجاوز الحد الأقصى (Limit Exceeded)', async () => {
    const mockRedis = {
      eval: vi.fn().mockResolvedValue([6, 30]),
    } as unknown as Redis;

    const result = await checkRateLimit(mockRedis, 'ip-blocked', 5, 60);

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(6);
    expect(result.remaining).toBe(0);
  });

  it('إنشاء مفتاح الـ Rate Limit بشكل صحيح', () => {
    const key = buildRateLimitKey('api', 'user-123', 'checkout');
    expect(key).toBe('ratelimit:api:user-123:checkout');
  });
});