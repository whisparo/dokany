// src/lib/env.ts
import type { D1Database } from '@cloudflare/workers-types';

/**
 * التعريف الموحد لبيئة العمل
 * كل المتغيرات المطلوبة في كل أجزاء المشروع
 */
export interface Env {
  // D1
  DB: D1Database;

  // Backblaze B2
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;

  // Telegram
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_BOT_TOKEN: string;

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;

  // Upstash QStash
  QSTASH_TOKEN: string;
  QSTASH_URL: string;

  // ✅ Cron Security (اختياري)
  CRON_SECRET?: string;

  // أي متغيرات أخرى
  [key: string]: unknown;
}