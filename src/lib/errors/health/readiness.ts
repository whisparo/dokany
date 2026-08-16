// lib/errors/health/readiness.ts
// الإصدار: 1.0.1
// الدور: مسار /readiness للتحقق من جاهزية النظام (D1، Redis، B2، QStash)
// المبدأ: فحص متوازي شامل للخدمات الأساسية مع تقرير مفصل

import { addBreadcrumb } from '../core/context';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

/**
 * نتيجة فحص خدمة واحدة
 */
export interface ServiceCheck {
  /** اسم الخدمة */
  name: string;
  /** حالة الخدمة */
  status: 'ok' | 'error' | 'degraded' | 'skipped';
  /** وقت الفحص بالمللي ثانية */
  durationMs: number;
  /** رسالة توضيحية */
  message?: string;
  /** تفاصيل إضافية (اختياري) */
  details?: Record<string, unknown>;
}

/**
 * نتيجة فحص الجاهزية الكامل
 */
export interface ReadinessResponse {
  /** الحالة العامة ('ready' أو 'not_ready') */
  status: 'ready' | 'not_ready';
  /** الطابع الزمني */
  timestamp: string;
  /** مدة الفحص الكلية بالمللي ثانية */
  totalDurationMs: number;
  /** قائمة الفحوصات */
  checks: ServiceCheck[];
  /** ملخص سريع */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

/**
 * خيارات فحص الجاهزية
 */
export interface ReadinessOptions {
  /** هل يجب فحص D1؟ (افتراضي: true) */
  checkD1?: boolean;
  /** هل يجب فحص Redis؟ (افتراضي: true) */
  checkRedis?: boolean;
  /** هل يجب فحص B2؟ (افتراضي: true) */
  checkB2?: boolean;
  /** هل يجب فحص QStash؟ (افتراضي: false) */
  checkQStash?: boolean;
  /** مهلة الفحص بالمللي ثانية (افتراضي: 5000) */
  timeoutMs?: number;
  /** هل يجب تضمين التفاصيل الكاملة؟ (افتراضي: false) */
  verbose?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// 🔍  فحص الجاهزية الرئيسي
// ═══════════════════════════════════════════════════════════════

export async function checkReadiness(
  env: any,
  options: ReadinessOptions = {}
): Promise<ReadinessResponse> {
  const startTime = performance.now();
  const {
    checkD1 = true,
    checkRedis = true,
    checkB2 = true,
    checkQStash = false,
    timeoutMs = 5000,
    verbose = false,
  } = options;

  // تجهيز مصفوفة الوعود للتشغيل المتوازي (Parallel Execution) للأداء الأقصى
  const checkPromises: Promise<ServiceCheck>[] = [];

  // 1️⃣ D1 Database
  if (checkD1) {
    checkPromises.push(checkD1Connection(env, timeoutMs));
  } else {
    checkPromises.push(
      Promise.resolve({
        name: 'D1 Database',
        status: 'skipped',
        durationMs: 0,
        message: 'Skipped by configuration',
      })
    );
  }

  // 2️⃣ Upstash Redis
  if (checkRedis) {
    checkPromises.push(checkRedisConnection(env, timeoutMs));
  } else {
    checkPromises.push(
      Promise.resolve({
        name: 'Upstash Redis',
        status: 'skipped',
        durationMs: 0,
        message: 'Skipped by configuration',
      })
    );
  }

  // 3️⃣ Backblaze B2
  if (checkB2) {
    checkPromises.push(checkB2Connection(env, timeoutMs));
  } else {
    checkPromises.push(
      Promise.resolve({
        name: 'Backblaze B2',
        status: 'skipped',
        durationMs: 0,
        message: 'Skipped by configuration',
      })
    );
  }

  // 4️⃣ Upstash QStash
  if (checkQStash) {
    checkPromises.push(checkQStashConnection(env, timeoutMs));
  } else {
    checkPromises.push(
      Promise.resolve({
        name: 'Upstash QStash',
        status: 'skipped',
        durationMs: 0,
        message: 'Skipped by configuration',
      })
    );
  }

  // انتظار اكتمال كافة الفحوصات بالتوازي
  const checks = await Promise.all(checkPromises);

  // 5️⃣ حساب النتائج
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'ok').length,
    failed: checks.filter((c) => c.status === 'error' || c.status === 'degraded').length,
    skipped: checks.filter((c) => c.status === 'skipped').length,
  };

  const isReady = summary.failed === 0 && summary.passed > 0;
  const totalDurationMs = Math.round(performance.now() - startTime);

  // 6️⃣ إضافة Breadcrumb
  try {
    addBreadcrumb('Readiness check completed', {
      status: isReady ? 'ready' : 'not_ready',
      passed: summary.passed,
      failed: summary.failed,
      duration: totalDurationMs,
    });
  } catch {
    // تجاهل
  }

  return {
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    totalDurationMs,
    checks: verbose
      ? checks
      : checks.map((c) => ({
          name: c.name,
          status: c.status,
          durationMs: c.durationMs,
          message: c.message,
        })),
    summary,
  };
}

// ═══════════════════════════════════════════════════════════════
// 🔌  دوال فحص الخدمات الفردية
// ═══════════════════════════════════════════════════════════════

/**
 * فحص اتصال D1 Database
 */
async function checkD1Connection(
  env: any,
  timeoutMs: number
): Promise<ServiceCheck> {
  const start = performance.now();
  const name = 'D1 Database';

  try {
    if (!env?.DB) {
      return {
        name,
        status: 'error',
        durationMs: Math.round(performance.now() - start),
        message: 'D1 binding is not available in environment',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await env.DB.prepare('SELECT 1 as connected').first('connected', {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (result !== undefined && result !== null) {
        return {
          name,
          status: 'ok',
          durationMs: Math.round(performance.now() - start),
          message: 'Connected and responsive',
          details: { result },
        };
      }

      return {
        name,
        status: 'degraded',
        durationMs: Math.round(performance.now() - start),
        message: 'Connected but unexpected response format',
      };
    } catch (queryError) {
      clearTimeout(timeoutId);
      throw queryError;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.name === 'AbortError';

    return {
      name,
      status: 'error',
      durationMs: Math.round(performance.now() - start),
      message: isTimeout ? `Query timeout after ${timeoutMs}ms` : errorMsg,
      details: {
        errorType: isTimeout ? 'Timeout' : 'ConnectionError',
      },
    };
  }
}

/**
 * فحص اتصال Upstash Redis
 */
async function checkRedisConnection(
  env: any,
  timeoutMs: number
): Promise<ServiceCheck> {
  const start = performance.now();
  const name = 'Upstash Redis';

  try {
    if (!env?.UPSTASH_REDIS_REST_URL || !env?.UPSTASH_REDIS_REST_TOKEN) {
      return {
        name,
        status: 'skipped',
        durationMs: Math.round(performance.now() - start),
        message: 'Redis credentials not configured',
      };
    }

    const { Redis } = await import('@upstash/redis');

    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    const ping = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

    if (ping === 'PONG') {
      return {
        name,
        status: 'ok',
        durationMs: Math.round(performance.now() - start),
        message: 'Connected and responsive',
        details: { ping: 'PONG' },
      };
    }

    return {
      name,
      status: 'degraded',
      durationMs: Math.round(performance.now() - start),
      message: `Unexpected response: ${String(ping)}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.message === 'Timeout';

    return {
      name,
      status: 'error',
      durationMs: Math.round(performance.now() - start),
      message: isTimeout ? `Ping timeout after ${timeoutMs}ms` : errorMsg,
      details: {
        errorType: isTimeout ? 'Timeout' : 'ConnectionError',
      },
    };
  }
}

/**
 * فحص اتصال Backblaze B2
 */
async function checkB2Connection(
  env: any,
  timeoutMs: number
): Promise<ServiceCheck> {
  const start = performance.now();
  const name = 'Backblaze B2';

  try {
    if (!env?.B2_ENDPOINT || !env?.B2_BUCKET_NAME || !env?.B2_ACCESS_KEY_ID || !env?.B2_SECRET_ACCESS_KEY) {
      return {
        name,
        status: 'skipped',
        durationMs: Math.round(performance.now() - start),
        message: 'B2 credentials not configured',
      };
    }

    // تصحيح الاستيراد للدالة المتاحة فعلياً createB2StoreFromEnv
    const { createB2StoreFromEnv } = await import('../storage/b2-store');
    const b2 = createB2StoreFromEnv(env);

    const exists = await Promise.race([
      b2.exists('health-check.tmp'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

    return {
      name,
      status: 'ok',
      durationMs: Math.round(performance.now() - start),
      message: 'Connected to B2 endpoint',
      details: {
        bucket: env.B2_BUCKET_NAME,
        endpoint: env.B2_ENDPOINT,
        healthFileExists: exists,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.message === 'Timeout';

    return {
      name,
      status: 'error',
      durationMs: Math.round(performance.now() - start),
      message: isTimeout ? `Connection timeout after ${timeoutMs}ms` : errorMsg,
      details: {
        errorType: isTimeout ? 'Timeout' : 'ConnectionError',
      },
    };
  }
}

/**
 * فحص اتصال Upstash QStash (اختياري)
 */
async function checkQStashConnection(
  env: any,
  timeoutMs: number
): Promise<ServiceCheck> {
  const start = performance.now();
  const name = 'Upstash QStash';

  try {
    if (!env?.QSTASH_TOKEN) {
      return {
        name,
        status: 'skipped',
        durationMs: Math.round(performance.now() - start),
        message: 'QStash token not configured',
      };
    }

    const baseUrl = env.QSTASH_URL || 'https://qstash.upstash.io/v2';

    const response = await Promise.race([
      fetch(`${baseUrl}/schedules?limit=1`, {
        headers: {
          Authorization: `Bearer ${env.QSTASH_TOKEN}`,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ]);

    if (response instanceof Response) {
      if (response.ok) {
        return {
          name,
          status: 'ok',
          durationMs: Math.round(performance.now() - start),
          message: 'Connected to QStash API',
          details: { statusCode: response.status },
        };
      }

      return {
        name,
        status: 'degraded',
        durationMs: Math.round(performance.now() - start),
        message: `QStash API returned ${response.status}`,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.message === 'Timeout';

    return {
      name,
      status: 'error',
      durationMs: Math.round(performance.now() - start),
      message: isTimeout ? `Connection timeout after ${timeoutMs}ms` : errorMsg,
      details: {
        errorType: isTimeout ? 'Timeout' : 'ConnectionError',
      },
    };
  }

  return {
    name,
    status: 'error',
    durationMs: Math.round(performance.now() - start),
    message: 'Unexpected QStash check failure',
  };
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دوال مساعدة للاستخدام في Workers
// ═══════════════════════════════════════════════════════════════

export async function readinessHandler(
  env: any,
  waitUntil?: (promise: Promise<unknown>) => void
): Promise<Response> {
  const result = await checkReadiness(env, {
    checkD1: true,
    checkRedis: true,
    checkB2: true,
    checkQStash: false,
    timeoutMs: 5000,
    verbose: true,
  });

  const statusCode = result.status === 'ready' ? 200 : 503;

  return new Response(JSON.stringify(result, null, 2), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

export async function nextReadinessHandler(env: any): Promise<Response> {
  return readinessHandler(env);
}

export default readinessHandler;