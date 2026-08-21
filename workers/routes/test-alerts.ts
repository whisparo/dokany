// workers/routes/test-alerts.ts

import { Hono } from 'hono';
import type { Env } from '../../src/lib/env';
import { errorOrchestrator } from '../../src/lib/errors/orchestrator';

const testAlertsRouter = new Hono<{ Bindings: Env }>();

testAlertsRouter.get('/test-alerts', async (c) => {
  console.log('🚀 [Worker API] Triggering Error Pipeline Test for Storage & Redis...');

  try {
    const testError = new Error(`Database Connection Spike Test - ${new Date().toISOString()}`);

    await errorOrchestrator.handleException(
      testError,
      c.env,
      {
        code: 'ERR_DATABASE_SPIKE_TEST',
        storeId: 'store_dokany_6251',
        shouldAlert: true,
        metadata: {
          action: 'testStoragePipeline',
          triggeredAt: new Date().toISOString(),
          environment: 'development',
        },
      } as any // 👈 Bypass مؤقت للـ Types لحد ما تبعت ملف الـ Interface
    );

    return c.json({
      success: true,
      message: 'Error logged into Redis Queue successfully! Check Redis Dashboard now.',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default testAlertsRouter;