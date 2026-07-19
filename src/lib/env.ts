// src/lib/env.ts
import type { D1Database } from '@cloudflare/workers-types';

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
 * الحصول على كائن البيئة
 * - في Cloudflare Pages: يقرأ من process.env (ستكون المتغيرات متاحة)
 * - في التطوير المحلي: يقرأ من process.env
 * 
 * ✅ يتم ربط الأسماء الفعلية (ERROR_BOT_TOKEN, ERROR_CHANNEL_ID)
 *    بالأسماء المتوقعة في الكود (TELEGRAM_BOT_TOKEN, TELEGRAM_ERROR_CHAT_ID)
 */
export function getEnv(): Env {
  const env = process.env;

  // ✅ Fallback لبيئة التطوير المحلي (في حالة عدم وجود DB Binding)
  // نستخدم كائن وهمي لتجنب الأعطال
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
    // ✅ DB: نقرأها من env (في Pages ستكون موجودة كـ Binding)
    // إذا لم تكن موجودة، نستخدم الـ fallback
    DB: (env.DB as unknown as D1Database) || localDB,
    B2_ENDPOINT: env.B2_ENDPOINT || '',
    B2_BUCKET_NAME: env.B2_BUCKET_NAME || '',
    B2_ACCESS_KEY_ID: env.B2_ACCESS_KEY_ID || '',
    B2_SECRET_ACCESS_KEY: env.B2_SECRET_ACCESS_KEY || '',
    // ✅ ربط ERROR_BOT_TOKEN → TELEGRAM_BOT_TOKEN
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