// src/lib/queue/media-queue.ts

import { getDb } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Env } from '@/lib/env';

// ============================================================
// 🔒 واجهات البيانات المحددة بدقة (Strict Types)
// ============================================================

export interface MediaProcessingJob {
  mediaId: string;
  storeId: string;
  mediaType: 'image' | 'video';
  rawUrl: string;
  idempotencyKey: string;
  sequenceNumber: number;
  retryCount?: number;
  lastError?: string;
}

export interface QueueOptions {
  delaySeconds?: number;
  maxRetries?: number;
}

interface ProcessorResponse {
  processedUrl?: string;
  error?: string;
}

// ============================================================
// 🚀 الدوال الأساسية (Main Queue Producer)
// ============================================================

/**
 * إدراج مهمة معالجة الوسائط في Cloudflare Queue أو التنفيذ اللحظي كـ Fallback
 */
export async function queueMediaProcessing(
  env: Env,
  mediaId: string,
  options?: QueueOptions
): Promise<void> {
  if (!env) {
    console.warn('[queueMediaProcessing] Env object is missing, skipping queue step.');
    return;
  }

  const db = getDb(env);

  try {
    const mediaRecord = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
    });

    if (!mediaRecord) {
      console.error(`[queueMediaProcessing] Media record not found: ${mediaId}`);
      return;
    }

    const idempotencyKey = `media_${mediaId}_${Date.now()}`;
    const sequenceNumber = await getNextSequenceNumber(env, mediaRecord.storeId);

    const job: MediaProcessingJob = {
      mediaId: mediaRecord.id,
      storeId: mediaRecord.storeId,
      mediaType: mediaRecord.type === 'video' ? 'video' : 'image',
      rawUrl: mediaRecord.url,
      idempotencyKey,
      sequenceNumber,
      retryCount: 0,
    };

    const queue = env.MEDIA_QUEUE;

    // 🛡️ Fallback محلي تلقائي في حالة عدم ضبط MEDIA_QUEUE في بيئة العمل
    if (!queue) {
      console.info('[queueMediaProcessing] MEDIA_QUEUE binding not configured. Running local sync fallback...');
      await processMediaSync(env, mediaRecord.id);
      return;
    }

    await queue.send(job, {
      delaySeconds: options?.delaySeconds || 0,
    });

    console.log(`[queueMediaProcessing] Media ${mediaId} queued successfully (seq: ${sequenceNumber})`);
  } catch (error) {
    console.error(`[queueMediaProcessing] Error while queuing media ${mediaId}:`, error);
  }
}

// ============================================================
// 🔧 الدوال المساعدة (Helpers & Fallbacks)
// ============================================================

/**
 * جلب رقم التسلسل التالي عبر Redis أو التوقيت الزمني
 */
async function getNextSequenceNumber(env: Env, storeId: string): Promise<number> {
  try {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      });

      const key = `seq:media:${storeId}`;
      const seq = await redis.incr(key);
      return Number(seq);
    }

    return Date.now();
  } catch (error) {
    console.warn('[getNextSequenceNumber] Redis sequence generation skipped, using timestamp fallback:', error);
    return Date.now();
  }
}

/**
 * معالجة الوسائط بشكل متزامن (Sync Fallback)
 */
async function processMediaSync(env: Env, mediaId: string): Promise<void> {
  console.log(`[processMediaSync] Synchronous processing triggered for media: ${mediaId}`);
  const db = getDb(env);

  try {
    const mediaRecord = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
    });

    if (!mediaRecord) return;

    const processedUrl = await processMediaInBackground(env, mediaRecord.url, mediaRecord.type);

    await db
      .update(media)
      .set({
        url: processedUrl,
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));

    console.log(`[processMediaSync] Media ${mediaId} synced successfully`);
  } catch (error) {
    console.error(`[processMediaSync] Failed during sync processing for media ${mediaId}:`, error);
  }
}

/**
 * استدعاء معالج الصور الخارجي/المستقل باحترافية وأمان
 */
async function processMediaInBackground(
  env: Env,
  rawUrl: string,
  mediaType: string
): Promise<string> {
  try {
    if (!env.MEDIA_PROCESSOR_URL) {
      console.info('[processMediaInBackground] MEDIA_PROCESSOR_URL not set. Retaining original raw URL.');
      return rawUrl;
    }

    const response = await fetch(`${env.MEDIA_PROCESSOR_URL}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({
        rawUrl,
        mediaType,
      }),
    });

    if (!response.ok) {
      console.warn(`[processMediaInBackground] Processor returned status ${response.status}. Retaining raw URL.`);
      return rawUrl;
    }

    const result = (await response.json()) as ProcessorResponse;
    return result.processedUrl || rawUrl;
  } catch (error) {
    console.error('[processMediaInBackground] Request failed, using fallback raw URL:', error);
    return rawUrl;
  }
}