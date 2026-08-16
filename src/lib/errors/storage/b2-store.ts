// lib/errors/storage/b2-store.ts
// الإصدار: 1.0.3
// الدور: طبقة التخزين المتكاملة لنظام الأخطاء (تستخدم B2Client + Compression + Queue Manager)

import { addBreadcrumb, type ErrorContext } from '../core/context';
import { B2Client, type B2ClientOptions } from './b2-client';
import { gzipCompress, gzipDecompress } from './b2-compression';
import { enqueueErrorKey, type QueueEnv } from './queue-manager';

// ═══════════════════════════════════════════════════════════════
// 📦  الأنواع
// ═══════════════════════════════════════════════════════════════

export interface B2WriteOptions {
  content: unknown;
  key: string;
  contentType?: string;
  compress?: boolean;
  metadata?: Record<string, string>;
  context?: ErrorContext;
  env?: QueueEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
  enqueue?: boolean;
}

export interface B2WriteResult {
  key: string;
  size: number;
  etag: string;
  compressed: boolean;
  enqueued: boolean;
}

export interface B2ReadOptions {
  key: string;
  compressed?: boolean;
}

export interface B2ReadResult<T = unknown> {
  content: T;
  size: number;
  etag: string;
  metadata?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════
// 🏗️  الـ Store الأساسي
// ═══════════════════════════════════════════════════════════════

export class B2Store {
  private client: B2Client;

  constructor(options: B2ClientOptions) {
    this.client = new B2Client(options);
  }

  async write(options: B2WriteOptions): Promise<B2WriteResult> {
    const { 
      content, 
      key, 
      contentType = 'application/json', 
      compress = true, 
      metadata = {}, 
      waitUntil, 
      enqueue = true,
      env 
    } = options;

    const jsonString = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    let body: Uint8Array;
    let contentEncoding: string | undefined;
    let compressed = false;

    if (compress) {
      body = await gzipCompress(jsonString);
      contentEncoding = 'gzip';
      compressed = true;
    } else {
      body = new TextEncoder().encode(jsonString);
    }

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
    };

    for (const [k, v] of Object.entries(metadata)) {
      headers[`x-amz-meta-${k}`] = v;
    }

    const { etag } = await this.client.put(key, body, headers);

    let enqueued = false;
    if (enqueue && waitUntil) {
      waitUntil(
        enqueueErrorKey(env, key).catch((err: unknown) => // 👈 تم تعديل الترتيب إلى (env, key)
          console.error(`[B2] Failed to enqueue ${key}:`, err)
        )
      );
      enqueued = true;
    }

    addBreadcrumb(`B2 write: ${key}`, { size: body.length, compressed, enqueued });
    return { key, size: body.length, etag, compressed, enqueued };
  }

  async read<T = unknown>(options: B2ReadOptions): Promise<B2ReadResult<T>> {
    const { key, compressed = true } = options;
    const { body, etag, metadata } = await this.client.get(key);

    let content: T;
    if (compressed) {
      try {
        const decompressed = await gzipDecompress(body);
        const text = new TextDecoder().decode(decompressed);
        content = JSON.parse(text) as T;
      } catch {
        const text = new TextDecoder().decode(body);
        content = JSON.parse(text) as T;
      }
    } else {
      const text = new TextDecoder().decode(body);
      content = JSON.parse(text) as T;
    }

    addBreadcrumb(`B2 read: ${key}`, { size: body.length });
    return { content, size: body.length, etag, metadata };
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(key);
    addBreadcrumb(`B2 delete: ${key}`);
  }

  async exists(key: string): Promise<boolean> {
    return await this.client.head(key);
  }

  // ═══════════════════════════════════════════════════════════════
  // 🛠️  دوال مساعدة للمسارات
  // ═══════════════════════════════════════════════════════════════

  static createErrorKey(prefix: string = 'errors/raw'): string {
    const date = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const uuid = crypto.randomUUID().slice(0, 8);
    return `${prefix}/${date}/error_${timestamp}_${uuid}.json`;
  }

  static createProcessedKey(originalKey: string): string {
    return originalKey.replace('errors/raw/', 'errors/processed/');
  }

  static createFailedKey(originalKey: string): string {
    return originalKey.replace('errors/raw/', 'errors/failed/');
  }
}

export function createB2StoreFromEnv(env: Record<string, string | undefined>): B2Store {
  const { B2_ENDPOINT, B2_BUCKET_NAME, B2_ACCESS_KEY_ID, B2_SECRET_ACCESS_KEY } = env;
  if (!B2_ENDPOINT || !B2_BUCKET_NAME || !B2_ACCESS_KEY_ID || !B2_SECRET_ACCESS_KEY) {
    throw new Error('Missing B2 environment variables');
  }
  return new B2Store({
    endpoint: B2_ENDPOINT,
    bucketName: B2_BUCKET_NAME,
    accessKeyId: B2_ACCESS_KEY_ID,
    secretAccessKey: B2_SECRET_ACCESS_KEY,
  });
}