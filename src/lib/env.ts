// src/lib/env.ts

import type { D1Database, KVNamespace, Queue } from '@cloudflare/workers-types';

/* ============================================================================
 * 📦 QUEUE PAYLOAD TYPES
 * ============================================================================ */

export interface MediaQueuePayload {
  fileId: string;
  action: 'process' | 'delete' | 'optimize';
  metadata?: Record<string, unknown>;
}

/* ============================================================================
 * 🛡️ SYSTEM ENVIRONMENT & BINDINGS
 * ============================================================================ */

export interface Env {
  // Database & Storage KV
  DB: D1Database;
  BUFFER_KV: KVNamespace; // 👈 تم إضافة BUFFER_KV للـ Snapshots
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

  // Upstash Services (Redis & QStash)
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  QSTASH_URL: string;
  QSTASH_TOKEN: string;

  // Background Media Worker & Queue Services
  MEDIA_QUEUE?: Queue<MediaQueuePayload>;
  MEDIA_PROCESSOR_URL?: string;

  // Application Public URLs
  NEXT_PUBLIC_APP_URL?: string;

  // Node / Worker Execution Context
  NODE_ENV?: string;
  ENVIRONMENT?: string;
  [key: string]: unknown;
}

/**
 * 🛠️ Alias Type لضمان التوافق التام مع نظام الـ Error Handling و Logger
 */
export type SystemEnvironment = Env;

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
    userId?: string;
    storeId?: string;
  };
}