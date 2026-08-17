// src/lib/queue/media-queue.ts

import { getDb } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Env, MediaQueuePayload } from '@/lib/env';
import { uploadToB2 } from '@/lib/storage';

// ============================================================
// 🔒 واجهات البيانات المحددة بدقة (Strict Types)
// ============================================================

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

    // 🔒 Idempotency Key ثابت مبني على id الصورة لضمان عدم التكرار
    const idempotencyKey = `media_job_${mediaId}`;
    const sequenceNumber = await getNextSequenceNumber(env, mediaRecord.storeId);

    // 🎯 مطابقة الكائن بدقة مع MediaQueuePayload المعرف في env.ts
    const job: MediaQueuePayload = {
      fileId: mediaRecord.id,
      action: 'process',
      metadata: {
        mediaId: mediaRecord.id,
        storeId: mediaRecord.storeId,
        mediaType: mediaRecord.type === 'video' ? 'video' : 'image',
        rawUrl: mediaRecord.url,
        idempotencyKey,
        sequenceNumber,
        retryCount: 0,
      },
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
 * معالجة الوسائط بشكل متزامن (Sync Fallback) ونقلها إلى B2
 */
async function processMediaSync(env: Env, mediaId: string): Promise<void> {
  console.log(`[processMediaSync] Synchronous processing triggered for media: ${mediaId}`);
  const db = getDb(env);

  try {
    const mediaRecord = await db.query.media.findFirst({
      where: eq(media.id, mediaId),
    });

    if (!mediaRecord) return;

    // 1️⃣ تحويل/معالجة الصورة أو سحبها ونقلها لـ Backblaze B2
    const processedUrl = await processMediaInBackground(
      env,
      mediaRecord.url,
      mediaRecord.type,
      mediaRecord.storeId,
      mediaRecord.filename
    );

    // 2️⃣ تحديث سجل D1 بالرابط النهائي والملف الأصلي
    await db
      .update(media)
      .set({
        url: processedUrl,
        originalUrl: mediaRecord.originalUrl || mediaRecord.url,
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));

    console.log(`[processMediaSync] Media ${mediaId} synced & archived successfully to B2`);
  } catch (error) {
    console.error(`[processMediaSync] Failed during sync processing for media ${mediaId}:`, error);
  }
}

/**
 * استدعاء معالج الصور الخارجي/المستقل، وإذا لم يتوفر يتم سحب الملف من Cloudinary وحفظه مباشرة في Backblaze B2
 */
async function processMediaInBackground(
  env: Env,
  rawUrl: string,
  mediaType: string,
  storeId?: string,
  filename?: string
): Promise<string> {
  try {
    // 1️⃣ إذا وُجدت خدمة معالجة خارجية
    if (env.MEDIA_PROCESSOR_URL) {
      const response = await fetch(`${env.MEDIA_PROCESSOR_URL}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          rawUrl,
          mediaType,
          storeId,
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as ProcessorResponse;
        if (result.processedUrl) return result.processedUrl;
      }
      console.warn('[processMediaInBackground] External Processor bypass, falling back to direct B2 archive.');
    }

    // 2️⃣ Fallback المعماري: سحب الصورة من Cloudinary ونقلها لـ B2 حماية للملفات
    if (storeId && filename && env.B2_BUCKET_NAME) {
      const imageRes = await fetch(rawUrl);
      if (imageRes.ok) {
        const imageBuffer = await imageRes.arrayBuffer();
        const b2Key = `stores/${storeId}/${mediaType}s/${Date.now()}_${filename}`;

        await uploadToB2(
          b2Key,
          imageBuffer,
          env,
          imageRes.headers.get('content-type') || undefined
        );

        const b2Endpoint = (env.B2_ENDPOINT || 'https://s3.us-west-004.backblazeb2.com').replace(/\/$/, '');
        return `${b2Endpoint}/${env.B2_BUCKET_NAME}/${b2Key}`;
      }
    }

    return rawUrl;
  } catch (error) {
    console.error('[processMediaInBackground] Archiving to B2 failed, retaining Cloudinary raw URL:', error);
    return rawUrl;
  }
}