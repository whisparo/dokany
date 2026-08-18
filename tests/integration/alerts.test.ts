// tests/integration/alerts.test.ts

import type { Env } from '@/lib/env';
import { alertService } from '@/lib/alerts/alert-service';

/**
 * 🧪 Integration Test Suite - Telegram Alerts System
 * هتعيط منه للتأكد من تنسيق الرسائل ووصولها فعلياً لشات تليجرام
 */
export async function runAlertsIntegrationTest(env: Env): Promise<void> {
  console.log('🚀 [Test] Starting Telegram Alerts Integration Test...\n');

  // 1️⃣ تجربة إرسال طلب جديد (NEW_ORDER)
  console.log('🛍️ [1/3] Testing NEW_ORDER Alert...');
  const orderResult = await alertService.dispatch(
    'NEW_ORDER',
    'INFO',
    {
      storeId: 'store_dokany_6251',
      orderId: 'ORD-2026-8891',
      customerName: 'أحمد محمود',
      totalAmount: 45000, // 450.00 ج.م (مخزنة كـ Integer)
      currency: 'EGP',
      itemsCount: 3,
    },
    env
  );
  console.log('Result:', orderResult ? '✅ Dispatched' : '❌ Failed');

  // 2️⃣ تجربة إرسال تنبيه مخزون (LOW_STOCK)
  console.log('\n📉 [2/3] Testing LOW_STOCK Alert...');
  const stockResult = await alertService.dispatch(
    'LOW_STOCK',
    'WARNING',
    {
      storeId: 'store_dokany_6251',
      productId: 'prod_kettle_01',
      productName: 'كاتل مياه استانلس 1.8 لتر',
      currentStock: 2,
      threshold: 5,
    },
    env
  );
  console.log('Result:', stockResult ? '✅ Dispatched' : '❌ Failed');

  // 3️⃣ تجربة إرسال خطأ حرج (CRITICAL_FAILURE)
  console.log('\n🚨 [3/3] Testing CRITICAL_FAILURE Alert...');
  const failureResult = await alertService.dispatch(
    'CRITICAL_FAILURE',
    'CRITICAL',
    {
      storeId: 'store_dokany_6251',
      action: 'processPaymentWebhook',
      error: 'Paymob Gateway Timeout (504 Gateway Timeout)',
      stack: 'Error: Timeout at PaymobAdapter.verifySignature (paymob.ts:42)\n at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    },
    env
  );
  console.log('Result:', failureResult ? '✅ Dispatched' : '❌ Failed');

  console.log('\n🎉 [Test Finished] Check your Telegram chat now!');
}