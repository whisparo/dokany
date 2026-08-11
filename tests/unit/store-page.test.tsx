// tests/unit/store-page.test.tsx
import { describe, it, expect, vi } from 'vitest';

// استيراد مباشر بدون @ لتخطي مشاكل الكاش في VS Code
import StorePage from '../../app/[locale]/(storefront)/[storeSlug]/page';
import { StorefrontOrchestrator } from '../../features/storefront-home/orchestrators/storefront-orchestrator';

// Mock لبيئة Cloudflare
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn().mockResolvedValue({
    env: { DB: {}, REDIS_URL: 'mock-redis' },
  }),
}));

// Mock للـ StorefrontOrchestrator (مع استخدام المسار النسبي المباشر)
vi.mock('../../features/storefront-home/orchestrators/storefront-orchestrator', () => ({
  StorefrontOrchestrator: {
    fetchPagePayload: vi.fn().mockResolvedValue({
      hero: { title: 'أهلاً بك في متجرنا' },
      productGrid: [{ id: 'p1', name: 'منتج 1', price: 100 }],
    }),
  },
}));

describe('Server Component - StorePage', () => {
  it('يجب أن يقوم بفك تشفير storeSlug واستدعاء الـ Orchestrator بالبيانات الصحيحة', async () => {
    const params = Promise.resolve({ locale: 'ar', storeSlug: '%D9%85%D8%AA%D8%AC%D8%B1%D9%8A' });
    const searchParams = Promise.resolve({ page: '1' });

    await StorePage({ params, searchParams });

    expect(StorefrontOrchestrator.fetchPagePayload).toHaveBeenCalledWith(
      'متجري',
      expect.anything(),
      { page: '1' }
    );
  });
});