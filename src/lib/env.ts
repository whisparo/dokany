// src/lib/env.ts

import type { D1Database, KVNamespace, Queue } from '@cloudflare/workers-types';

export interface Env {
  // Database & Storage KV
  DB: D1Database;
  CUSTOM_DOMAINS_KV?: KVNamespace;

  // Authentication & Internal Security
  BETTER_AUTH_SECRET: string;
  INTERNAL_API_SECRET?: string;
  CRON_SECRET?: string;

  // Backblaze B2 Storage
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;

  // Telegram Notifications & Webhooks
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_ADMIN_CHAT_ID?: string;
  ERROR_CHANNEL_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_WEBHOOK_URL?: string;
  ERROR_BOT_TOKEN?: string;
  ADMIN_TELEGRAM_CHAT_ID?: string;

  // Upstash Services (Redis & QStash)
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  QSTASH_URL: string;
  QSTASH_TOKEN: string;

  // Background Media Worker & Queue Services
  MEDIA_QUEUE?: Queue<unknown>;
  MEDIA_PROCESSOR_URL?: string;

  // Application Public URLs
  NEXT_PUBLIC_APP_URL?: string;
}

/* ============================================================================
 * 🛡️ HONO CONTEXT & AUTH TYPES
 * ============================================================================ */

export interface UserContext {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    user?: UserContext;
    userId?: string;  // 👈 إضافة للـ Typesafety
    storeId?: string; // 👈 إضافة للـ Typesafety
  };
}