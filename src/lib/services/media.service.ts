// src/lib/services/media.service.ts

import { getDb } from '@/lib/db';
import { media, type Media, type MediaType, type MediaMetadata } from '@/lib/db/schema/media';
import { queueMediaProcessing } from '@/lib/queue/media-queue';
import { eq, and } from 'drizzle-orm';
import type { Env } from '@/lib/env';

// ============================================================
// 🔒 Interfaces لمدخلات السيرفيس
// ============================================================

export interface PrepareUploadInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  type: 'image' | 'video' | 'document';
  storeId: string;
}

export interface ConfirmMediaInput {
  storeId: string;
  url: string;
  originalUrl?: string;
  type: MediaType;
  mimeType: string;
  filename: string;
  size: number;
  productId?: string;
  categoryId?: string;
  isPrimary?: boolean;
  order?: number;
  metadata?: MediaMetadata;
}

export interface DeleteMediaInput {
  storeId: string;
  productId: string;
  mediaId: string;
}

// ============================================================
// 🛠️ Media Service Class
// ============================================================

export class MediaService {
  /**
   * 1️⃣ تجهيز وإرجاع رابط الرفع المباشر لـ Backblaze B2 / Storage
   */
  static async prepareUploadUrl(env: Env, input: PrepareUploadInput) {
    const { B2_ENDPOINT, B2_BUCKET_NAME } = env;

    if (!B2_ENDPOINT || !B2_BUCKET_NAME) {
      throw new Error('B2 Storage configuration is missing from environment');
    }

    const fileExt = input.fileName.split('.').pop() || 'bin';
    const uniqueKey = `stores/${input.storeId}/${input.type}s/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
    const uploadUrl = `${B2_ENDPOINT}/${B2_BUCKET_NAME}/${uniqueKey}`;

    return {
      uploadUrl,
      fileKey: uniqueKey,
      bucketName: B2_BUCKET_NAME,
      resourceType: input.type,
    };
  }

  /**
   * 2️⃣ حفظ بيانات الوسائط المرفوعة في قاعدة البيانات D1 وإرسالها للـ Queue
   */
  static async confirmAndQueueMedia(env: Env, input: ConfirmMediaInput): Promise<Media> {
    const db = getDb(env);

    // تسجيل السجل في قاعدة البيانات
    const [inserted] = await db
      .insert(media)
      .values({
        storeId: input.storeId,
        productId: input.productId || null,
        categoryId: input.categoryId || null,
        url: input.url,
        originalUrl: input.originalUrl || input.url,
        type: input.type,
        mimeType: input.mimeType,
        filename: input.filename,
        size: input.size,
        isPrimary: input.isPrimary || false,
        order: input.order || 0,
        metadata: input.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to insert media record into D1 database');
    }

    // إرسال للمهمة إلى الـ Queue للمعالجة في الخلفية
    await queueMediaProcessing(env, inserted.id);

    return inserted;
  }

  /**
   * 3️⃣ حذف ناعم (Soft Delete) لسجل الوسائط
   */
  static async softDeleteMedia(env: Env, input: DeleteMediaInput): Promise<boolean> {
    const db = getDb(env);

    const updated = await db
      .update(media)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(media.id, input.mediaId),
          eq(media.storeId, input.storeId),
          eq(media.productId, input.productId)
        )
      )
      .returning();

    return updated.length > 0;
  }

  /**
   * 4️⃣ جلب وسائط منتج معين
   */
  static async getProductMedia(env: Env, storeId: string, productId: string): Promise<Media[]> {
    const db = getDb(env);

    return await db.query.media.findMany({
      where: and(
        eq(media.storeId, storeId),
        eq(media.productId, productId)
      ),
      orderBy: (mediaTable, { asc }) => [asc(mediaTable.order), asc(mediaTable.createdAt)],
    });
  }
}