// src/lib/env.ts
import type { D1Database } from '@cloudflare/workers-types';
import { getRequestContext } from '@cloudflare/next-on-pages';

export interface Env {
  DB: D1Database;
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_BOT_TOKEN: string;
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
 */
export function getEnv(): Env {
  try {
    const ctx = getRequestContext();
    if (ctx && ctx.env) {
      return ctx.env as unknown as Env;
    }
  } catch {
    // في بيئة next dev، نستخدم process.env
  }

  const env = process.env;
  return {
    DB: undefined as unknown as D1Database,
    B2_ENDPOINT: env.B2_ENDPOINT || '',
    B2_BUCKET_NAME: env.B2_BUCKET_NAME || '',
    B2_ACCESS_KEY_ID: env.B2_ACCESS_KEY_ID || '',
    B2_SECRET_ACCESS_KEY: env.B2_SECRET_ACCESS_KEY || '',
    TELEGRAM_ERROR_CHAT_ID: env.TELEGRAM_ERROR_CHAT_ID || '',
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || '',
    UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL || env.REDIS_URL || '',
    UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_TOKEN || '',
    QSTASH_URL: env.QSTASH_URL || '',
    QSTASH_TOKEN: env.QSTASH_TOKEN || '',
    CRON_SECRET: env.CRON_SECRET,
  };
}