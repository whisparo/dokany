// lib/errors/health/ping.ts
// الإصدار: 1.0.1
// الدور: مسار /ping و /health للمراقبة الخارجية (Uptime Robot & Health Checks)
// المبدأ: استجابة 200 OK فورية للمسارات الخفيفة + فحص متكامل للموارد عند الطلب

import { addBreadcrumb } from '../core/context';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

export interface PingResponse {
  /** الحالة (دائماً 'ok') */
  status: 'ok';
  /** الطابع الزمني */
  timestamp: string;
  /** معرف الـ Worker (اختياري) */
  workerId?: string;
}

// ═══════════════════════════════════════════════════════════════
// 🏓  معالج مسار /ping
// ═══════════════════════════════════════════════════════════════

/**
 * معالج مسار /ping - يُعيد استجابة 200 OK فورية
 */
export function handlePing(
  env?: any,
  waitUntil?: (promise: Promise<unknown>) => void
): Response {
  // 1️⃣ إضافة Breadcrumb (غير معطل للاستجابة)
  try {
    addBreadcrumb('Ping request received', { path: '/ping' });
  } catch {
    // تجاهل فشل Breadcrumb
  }

  // 2️⃣ جدولة أي عمليات خلفية (إن وُجدت)
  if (waitUntil) {
    waitUntil(
      (async () => {
        try {
          if (env?.UPSTASH_REDIS_REST_URL && env?.UPSTASH_REDIS_REST_TOKEN) {
            const { Redis } = await import('@upstash/redis');
            const redis = new Redis({
              url: env.UPSTASH_REDIS_REST_URL,
              token: env.UPSTASH_REDIS_REST_TOKEN,
            });
            await redis.set('health:last_ping', Date.now(), { ex: 3600 });
          }
        } catch {
          // تجاهل فشل Redis في الخلفية
        }
      })()
    );
  }

  // 3️⃣ بناء الاستجابة
  const workerId = env?.WORKER_ID || (typeof process !== 'undefined' ? process.env?.WORKER_ID : undefined);

  const response: PingResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...(workerId && { workerId }),
  };

  // 4️⃣ إرجاع الاستجابة مع هيدرات مناسبة
  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Ping-Version': '1.0.1',
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// 🏓  معالج مسار /ping لـ Next.js
// ═══════════════════════════════════════════════════════════════

export function pingResponse(): Response {
  const workerId = typeof process !== 'undefined' ? process.env?.WORKER_ID : 'nextjs';

  const response: PingResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    workerId: workerId || 'nextjs',
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Ping-Version': '1.0.1',
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// 🏓  استجابة خفيفة جداً (للـ Uptime Robot)
// ═══════════════════════════════════════════════════════════════

export function pingLight(): Response {
  return new Response('OK', {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'text/plain',
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دالة مساعدة للتحقق من صحة النظام الكلية (/health)
// ═══════════════════════════════════════════════════════════════

export async function healthCheck(
  env?: any,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<Response> {
  const checks: {
    name: string;
    status: 'ok' | 'error';
    message?: string;
    durationMs?: number;
  }[] = [];

  const startTime = performance.now();

  // 1️⃣ فحص قاعدة البيانات D1
  if (env?.DB) {
    const start = performance.now();
    try {
      const result = await env.DB.prepare('SELECT 1').first();
      checks.push({
        name: 'D1 Database',
        status: result ? 'ok' : 'error',
        durationMs: Math.round(performance.now() - start),
        message: result ? 'Connected' : 'Query returned no result',
      });
    } catch (error) {
      checks.push({
        name: 'D1 Database',
        status: 'error',
        durationMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }

  // 2️⃣ فحص Redis
  if (env?.UPSTASH_REDIS_REST_URL && env?.UPSTASH_REDIS_REST_TOKEN) {
    const start = performance.now();
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      });

      const ping = await redis.ping();
      checks.push({
        name: 'Upstash Redis',
        status: ping === 'PONG' ? 'ok' : 'error',
        durationMs: Math.round(performance.now() - start),
        message: ping === 'PONG' ? 'Connected' : 'Invalid response',
      });
    } catch (error) {
      checks.push({
        name: 'Upstash Redis',
        status: 'error',
        durationMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }

  // 3️⃣ فحص Backblaze B2 (تصحيح المسميات واستدعاءcreateB2StoreFromEnv)
  if (env?.B2_ACCESS_KEY_ID && env?.B2_BUCKET_NAME) {
    const start = performance.now();
    try {
      const { createB2StoreFromEnv } = await import('../storage/b2-store');
      const b2 = createB2StoreFromEnv(env);
      
      const exists = await b2.exists('health-check.tmp');
      checks.push({
        name: 'Backblaze B2',
        status: 'ok',
        durationMs: Math.round(performance.now() - start),
        message: 'Connected',
      });
    } catch (error) {
      checks.push({
        name: 'Backblaze B2',
        status: 'error',
        durationMs: Math.round(performance.now() - start),
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }

  // 4️⃣ تحديد الصحة الكلية
  const allOk = checks.every((check) => check.status === 'ok');
  const httpStatus = allOk ? 200 : 503;

  // 5️⃣ إضافة Breadcrumb
  try {
    addBreadcrumb('Health check completed', {
      status: allOk ? 'ok' : 'degraded',
      checks: checks.length,
      failed: checks.filter((c) => c.status === 'error').length,
    });
  } catch {
    // تجاهل
  }

  const duration = performance.now() - startTime;

  // 6️⃣ بناء الاستجابة
  const response = {
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    durationMs: Math.round(duration),
    checks,
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// 📋  دالة مساعدة للمراقبة الخارجية (Uptime Robot)
// ═══════════════════════════════════════════════════════════════

export function uptimeResponse(): Response {
  return new Response('OK', {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'text/plain',
    },
  });
}

export default handlePing;