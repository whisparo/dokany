// lib/errors/clients/qstash.ts
// الإصدار: 1.0.1
// الدور: عميل Upstash QStash المتكامل مع Circuit Breaker و Rate Limiter
// المبدأ: جدولة آمنة للمهام الخلفية مع Retry مدمج وتوزيع عبر الخدمة

import { addBreadcrumb } from '../core/context';
import { withCircuitBreaker } from '../guards/circuit-breaker';
import { withRateLimit } from '../guards/rate-limiter';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

/**
 * متغيرات البيئة المعتمدة للخدمة
 */
export interface QStashEnv {
  QSTASH_TOKEN?: string;
  QSTASH_URL?: string;
  QSTASH_DEFAULT_RETRIES?: string | number;
  QSTASH_DEFAULT_DELAY?: string | number;
  QSTASH_TIMEOUT_MS?: string | number;
  [key: string]: unknown;
}

/**
 * خيارات إرسال رسالة إلى QStash
 */
export interface QStashPublishOptions {
  /** عنوان URL الوجهة (الـ Worker الذي سيعالج الرسالة) */
  destination: string;

  /** البيانات المرسلة (ستُحوّل إلى JSON) */
  body: unknown;

  /** عدد المحاولات عند الفشل (افتراضي: 3) */
  retries?: number;

  /** تأخير الإرسال بالثواني (افتراضي: 0) */
  delaySeconds?: number;

  /** جدول Cron (مثل: '* /10 * * * *') */
  cron?: string;

  /** رؤوس إضافية (Headers) */
  headers?: Record<string, string>;

  /** مهلة الطلب بالمللي ثانية (افتراضي: 10000) */
  timeoutMs?: number;

  /** هل يجب استخدام Circuit Breaker؟ (افتراضي: true) */
  useCircuitBreaker?: boolean;

  /** هل يجب استخدام Rate Limiter؟ (افتراضي: true) */
  useRateLimiter?: boolean;
}

/**
 * نتيجة إرسال رسالة إلى QStash
 */
export interface QStashPublishResult {
  /** هل تم الإرسال بنجاح؟ */
  success: boolean;
  /** معرف الرسالة (من QStash) */
  messageId?: string;
  /** معرف المهمة المجدولة (في حالة Cron) */
  scheduleId?: string;
  /** رمز الخطأ (إن فشل) */
  errorCode?: string;
  /** رسالة الخطأ (إن فشل) */
  errorMessage?: string;
}

/**
 * تكوين عميل QStash
 */
export interface QStashConfig {
  /** عنوان URL الأساسي لـ QStash API */
  baseUrl?: string;

  /** توكن المصادقة */
  token: string;

  /** عدد المحاولات الافتراضي (افتراضي: 3) */
  defaultRetries?: number;

  /** التأخير الافتراضي بالثواني (افتراضي: 0) */
  defaultDelaySeconds?: number;

  /** مهلة الطلب بالمللي ثانية (افتراضي: 10000) */
  defaultTimeoutMs?: number;

  /** اسم الخدمة لـ Circuit Breaker (افتراضي: 'qstash') */
  serviceName?: string;
}

// ═══════════════════════════════════════════════════════════════
// 🤖  عميل QStash الرئيسي
// ═══════════════════════════════════════════════════════════════

export class QStashClient {
  private readonly config: Required<Omit<QStashConfig, 'baseUrl'> & {
    baseUrl: string;
  }>;
  private readonly serviceName: string;

  constructor(config: QStashConfig) {
    this.config = {
      baseUrl: config.baseUrl ?? 'https://qstash.upstash.io/v2',
      token: config.token,
      defaultRetries: config.defaultRetries ?? 3,
      defaultDelaySeconds: config.defaultDelaySeconds ?? 0,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 10000,
      serviceName: config.serviceName ?? 'qstash',
    };

    this.serviceName = this.config.serviceName;
  }

  // ═══════════════════════════════════════════════════════════════
  // 📤  الطرق العامة (Public Methods)
  // ═══════════════════════════════════════════════════════════════

  /**
   * إرسال رسالة إلى QStash (مهمة لمرة واحدة أو مجدولة)
   */
  async publish(
    options: QStashPublishOptions,
    env: QStashEnv
  ): Promise<QStashPublishResult> {
    const {
      destination,
      body,
      retries = this.config.defaultRetries,
      delaySeconds = this.config.defaultDelaySeconds,
      cron,
      headers = {},
      timeoutMs = this.config.defaultTimeoutMs,
      useCircuitBreaker = true,
      useRateLimiter = true,
    } = options;

    const executionFn = async (): Promise<QStashPublishResult> => {
      const rateLimitedFn = async (): Promise<QStashPublishResult> => {
        return await this.sendRequest(destination, body, {
          retries,
          delaySeconds,
          cron,
          headers,
          timeoutMs,
        });
      };

      if (useRateLimiter) {
        return await withRateLimit(
          env,
          this.serviceName,
          rateLimitedFn,
          { limit: 50, windowSeconds: 1 },
          'publish'
        );
      }

      return await rateLimitedFn();
    };

    if (useCircuitBreaker) {
      try {
        return await withCircuitBreaker(
          env,
          this.serviceName,
          executionFn,
          { failureThreshold: 3, openDurationSeconds: 120 }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          errorCode: 'CIRCUIT_OPEN',
          errorMessage: `Circuit breaker open: ${errorMessage}`,
        };
      }
    }

    try {
      return await executionFn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        errorCode: 'EXECUTION_ERROR',
        errorMessage,
      };
    }
  }

  /**
   * جدولة مهمة دورية (Cron)
   */
  async schedule(
    cron: string,
    options: Omit<QStashPublishOptions, 'cron'>,
    env: QStashEnv
  ): Promise<QStashPublishResult> {
    return await this.publish(
      {
        ...options,
        cron,
      },
      env
    );
  }

  /**
   * إرسال رسالة بتأخير (مهمة مؤجلة)
   */
  async publishDelayed(
    delaySeconds: number,
    options: Omit<QStashPublishOptions, 'delaySeconds'>,
    env: QStashEnv
  ): Promise<QStashPublishResult> {
    return await this.publish(
      {
        ...options,
        delaySeconds,
      },
      env
    );
  }

  /**
   * إلغاء مهمة مجدولة (Cron)
   */
  async cancelSchedule(scheduleId: string, _env?: QStashEnv): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/schedules/${scheduleId}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[QStash] Failed to cancel schedule ${scheduleId}:`, errorText);
        return false;
      }

      addBreadcrumb(`QStash schedule cancelled: ${scheduleId}`, {
        service: this.serviceName,
      });

      return true;
    } catch (error) {
      console.warn(`[QStash] Error cancelling schedule ${scheduleId}:`, error);
      return false;
    }
  }

  /**
   * الحصول على حالة المهمة (من خلال معرف الرسالة)
   */
  async getMessageStatus(messageId: string, _env?: QStashEnv): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed';
    attempts: number;
    error?: string;
  } | null> {
    try {
      const url = `${this.config.baseUrl}/messages/${messageId}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        status: string;
        attempts: number;
        error?: string;
      };

      return {
        status: this.mapStatus(data.status),
        attempts: data.attempts,
        error: data.error,
      };
    } catch (error) {
      console.warn(`[QStash] Failed to get message status ${messageId}:`, error);
      return null;
    }
  }

  /**
   * إرسال رسالة اختبار (للتأكد من صحة التوكن)
   */
  async test(env: QStashEnv): Promise<boolean> {
    const result = await this.publish(
      {
        destination: 'https://httpbin.org/post',
        body: { test: true, timestamp: Date.now() },
        retries: 1,
        delaySeconds: 0,
      },
      env
    );
    return result.success;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🧩  الدوال الداخلية (Private Helpers)
  // ═══════════════════════════════════════════════════════════════

  /**
   * إرسال طلب إلى QStash API v2
   */
  private async sendRequest(
    destination: string,
    body: unknown,
    options: {
      retries: number;
      delaySeconds: number;
      cron?: string;
      headers: Record<string, string>;
      timeoutMs: number;
    }
  ): Promise<QStashPublishResult> {
    const { retries, delaySeconds, cron, headers, timeoutMs } = options;

    let url: string;
    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
      ...headers,
    };

    if (cron) {
      url = `${this.config.baseUrl}/schedules`;
      requestHeaders['Upstash-Cron'] = cron;
      requestHeaders['Upstash-Destination'] = destination;
    } else {
      url = `${this.config.baseUrl}/publish/${encodeURIComponent(destination)}`;
    }

    if (retries >= 0) {
      requestHeaders['Upstash-Retries'] = String(retries);
    }

    if (delaySeconds > 0) {
      requestHeaders['Upstash-Delay'] = `${delaySeconds}s`;
    }

    const payload = typeof body === 'string' ? body : JSON.stringify(body);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await response.json()) as {
        messageId?: string;
        scheduleId?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        return {
          success: false,
          errorCode: `HTTP_${response.status}`,
          errorMessage: data.error || data.message || `HTTP ${response.status}`,
        };
      }

      addBreadcrumb(`QStash published: ${destination}`, {
        service: this.serviceName,
        cron: cron || 'once',
        delaySeconds,
        messageId: data.messageId,
        scheduleId: data.scheduleId,
      });

      return {
        success: true,
        messageId: data.messageId,
        scheduleId: data.scheduleId,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const isAbort = error instanceof Error && error.name === 'AbortError';
      const isNetwork = error instanceof Error && error.name === 'TypeError';

      return {
        success: false,
        errorCode: isAbort ? 'TIMEOUT' : isNetwork ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
        errorMessage: isAbort
          ? `Request timeout after ${timeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  /**
   * تحويل حالة QStash إلى حالة موحدة
   */
  private mapStatus(status: string): 'pending' | 'processing' | 'completed' | 'failed' {
    if (status === 'pending' || status === 'scheduled') return 'pending';
    if (status === 'processing' || status === 'running') return 'processing';
    if (status === 'completed' || status === 'success') return 'completed';
    if (status === 'failed' || status === 'error') return 'failed';
    return 'pending';
  }

  /**
   * الحصول على حالة العميل (للتصحيح)
   */
  getStatus(): {
    serviceName: string;
    baseUrl: string;
  } {
    return {
      serviceName: this.serviceName,
      baseUrl: this.config.baseUrl,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 🏭  المصنع (Factory)
// ═══════════════════════════════════════════════════════════════

let defaultQStashClient: QStashClient | null = null;

/**
 * إنشاء عميل QStash من متغيرات البيئة
 */
export function createQStashClientFromEnv(env: QStashEnv): QStashClient {
  const token = env.QSTASH_TOKEN;
  const baseUrl = env.QSTASH_URL || 'https://qstash.upstash.io/v2';

  if (!token) {
    throw new Error('QSTASH_TOKEN is required');
  }

  return new QStashClient({
    baseUrl,
    token,
    defaultRetries: Number(env.QSTASH_DEFAULT_RETRIES) || 3,
    defaultDelaySeconds: Number(env.QSTASH_DEFAULT_DELAY) || 0,
    defaultTimeoutMs: Number(env.QSTASH_TIMEOUT_MS) || 10000,
    serviceName: 'qstash',
  });
}

/**
 * الحصول على عميل QStash الافتراضي (Singleton)
 */
export function getQStashClient(env: QStashEnv): QStashClient {
  if (!defaultQStashClient) {
    defaultQStashClient = createQStashClientFromEnv(env);
  }
  return defaultQStashClient;
}

// ═══════════════════════════════════════════════════════════════
// 🛠️  دوال مساعدة للاستخدام السريع
// ═══════════════════════════════════════════════════════════════

/**
 * إرسال رسالة إلى QStash (دالة مساعدة)
 */
export async function publishToQStash(
  env: QStashEnv,
  destination: string,
  body: unknown,
  options?: Omit<QStashPublishOptions, 'destination' | 'body'>
): Promise<QStashPublishResult> {
  const client = getQStashClient(env);
  return client.publish(
    {
      destination,
      body,
      ...options,
    },
    env
  );
}

/**
 * جدولة مهمة دورية (دالة مساعدة)
 */
export async function scheduleQStash(
  env: QStashEnv,
  cron: string,
  destination: string,
  body: unknown,
  options?: Omit<QStashPublishOptions, 'destination' | 'body' | 'cron'>
): Promise<QStashPublishResult> {
  const client = getQStashClient(env);
  return client.schedule(
    cron,
    {
      destination,
      body,
      ...options,
    },
    env
  );
}

/**
 * إرسال رسالة بتأخير (دالة مساعدة)
 */
export async function publishDelayedToQStash(
  env: QStashEnv,
  delaySeconds: number,
  destination: string,
  body: unknown,
  options?: Omit<QStashPublishOptions, 'destination' | 'body' | 'delaySeconds'>
): Promise<QStashPublishResult> {
  const client = getQStashClient(env);
  return client.publishDelayed(
    delaySeconds,
    {
      destination,
      body,
      ...options,
    },
    env
  );
}

/**
 * إلغاء مهمة مجدولة (دالة مساعدة)
 */
export async function cancelQStashSchedule(
  env: QStashEnv,
  scheduleId: string
): Promise<boolean> {
  const client = getQStashClient(env);
  return client.cancelSchedule(scheduleId, env);
}

/**
 * تنفيذ عملية مع إعادة محاولة تلقائية عبر QStash
 */
export async function scheduleRetry(
  env: QStashEnv,
  destination: string,
  body: unknown,
  delaySeconds: number = 60,
  maxRetries: number = 3
): Promise<QStashPublishResult> {
  const retryBody = {
    ...(typeof body === 'object' && body !== null ? body : { data: body }),
    __retry: {
      scheduledAt: new Date().toISOString(),
      maxRetries,
    },
  };

  return await publishDelayedToQStash(
    env,
    delaySeconds,
    destination,
    retryBody,
    {
      retries: maxRetries - 1,
      headers: {
        'X-Retry-Count': '1',
        'X-Max-Retries': String(maxRetries),
      },
    }
  );
}