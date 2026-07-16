// src/lib/env.ts
import type { D1Database } from '@cloudflare/workers-types';
import { getRequestContext } from '@cloudflare/next-on-pages';

export interface Env {
  DB: D1Database;
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ERROR_CHAT_ID: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  QSTASH_URL: string;
  QSTASH_TOKEN: string;
  CRON_SECRET?: string;
  [key: string]: unknown;
}

/**
 * الحصول على كائن البيئة بأمان
 * - في Pages Functions: يستخدم getRequestContext().env
 * - في التطوير المحلي: يستخدم process.env
 * 
 * ✅ يتم ربط الأسماء الفعلية (ERROR_BOT_TOKEN, ERROR_CHANNEL_ID)
 *    بالأسماء المتوقعة في الكود (TELEGRAM_BOT_TOKEN, TELEGRAM_ERROR_CHAT_ID)
 */
export function getEnv(): Env {
  try {
    const ctx = getRequestContext();
    if (ctx && ctx.env) {
      const env = ctx.env as Record<string, unknown>;

      return {
        DB: env.DB as D1Database,
        B2_ENDPOINT: (env.B2_ENDPOINT as string) || '',
        B2_BUCKET_NAME: (env.B2_BUCKET_NAME as string) || '',
        B2_ACCESS_KEY_ID: (env.B2_ACCESS_KEY_ID as string) || '',
        B2_SECRET_ACCESS_KEY: (env.B2_SECRET_ACCESS_KEY as string) || '',
        // ✅ ربط ERROR_BOT_TOKEN → TELEGRAM_BOT_TOKEN
        TELEGRAM_BOT_TOKEN: (env.ERROR_BOT_TOKEN as string) || (env.TELEGRAM_BOT_TOKEN as string) || '',
        // ✅ ربط ERROR_CHANNEL_ID → TELEGRAM_ERROR_CHAT_ID
        TELEGRAM_ERROR_CHAT_ID: (env.ERROR_CHANNEL_ID as string) || (env.TELEGRAM_ERROR_CHAT_ID as string) || '',
        UPSTASH_REDIS_REST_URL: (env.UPSTASH_REDIS_REST_URL as string) || (env.REDIS_URL as string) || '',
        UPSTASH_REDIS_REST_TOKEN: (env.UPSTASH_REDIS_REST_TOKEN as string) || (env.REDIS_TOKEN as string) || '',
        QSTASH_URL: (env.QSTASH_URL as string) || '',
        QSTASH_TOKEN: (env.QSTASH_TOKEN as string) || '',
        CRON_SECRET: env.CRON_SECRET as string | undefined,
      };
    }
  } catch {
    // بيئة التطوير المحلي (next dev)
  }

  // ✅ Fallback لـ process.env (للتطوير المحلي)
  const env = process.env;

  const localDB = (globalThis as any).__miniflare?.bindings?.DB || {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true }),
    }),
  };

  return {
    DB: localDB as unknown as D1Database,
    B2_ENDPOINT: env.B2_ENDPOINT || '',
    B2_BUCKET_NAME: env.B2_BUCKET_NAME || '',
    B2_ACCESS_KEY_ID: env.B2_ACCESS_KEY_ID || '',
    B2_SECRET_ACCESS_KEY: env.B2_SECRET_ACCESS_KEY || '',
    // ✅ ربط ERROR_BOT_TOKEN → TELEGRAM_BOT_TOKEN (للتطوير المحلي أيضاً)
    TELEGRAM_BOT_TOKEN: env.ERROR_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '',
    // ✅ ربط ERROR_CHANNEL_ID → TELEGRAM_ERROR_CHAT_ID
    TELEGRAM_ERROR_CHAT_ID: env.ERROR_CHANNEL_ID || env.TELEGRAM_ERROR_CHAT_ID || '',
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL || env.REDIS_URL || '',
    UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_TOKEN || '',
    QSTASH_URL: env.QSTASH_URL || '',
    QSTASH_TOKEN: env.QSTASH_TOKEN || '',
    CRON_SECRET: env.CRON_SECRET,
  };
}