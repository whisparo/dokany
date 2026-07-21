// src/lib/env.ts

import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;
  
  // Telegram Variables
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_URL?: string;
  ERROR_BOT_TOKEN?: string;
  
  // Internal Security Secrets
  INTERNAL_API_SECRET?: string;
  CRON_SECRET?: string;
  
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  QSTASH_URL: string;
  QSTASH_TOKEN: string;
  
  NEXT_PUBLIC_APP_URL?: string;
}