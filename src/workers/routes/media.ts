// src/worker/routes/media.ts

import { Hono, type Context } from 'hono';
import { AwsClient } from 'aws4fetch';
import { eq, and, isNull } from 'drizzle-orm';
import type { AppEnv } from '@/lib/env';
import { getDb } from '@/lib/db';
import { media } from '@/lib/db/schema/media';
import { stores } from '@/lib/db/schema/stores';
import {
  imageUploadSchema,
  videoUploadSchema,
  deleteMediaSchema,
} from '@/lib/validations/media';
import { queueMediaProcessing } from '@/lib/queue/media-queue';
import { getStoreCloudinaryAccount } from '@/lib/services/cloudinary';
import { safeExecute, SystemError } from '@/lib/errors';
import { requireAuth } from '@/workers/middleware/auth';

export const mediaRouter = new Hono<AppEnv>();

// ============================================================
// 🔒 Helper حماية داخلي للتأكد من ملكية المتجر
// ============================================================
async function verifyStoreOwnership<E extends AppEnv>(
  c: Context<E>
): Promise<{ storeId: string; userId: string }> {
  const storeId = c.req.header('x-store-id');

  const user = c.get('user') as { id: string } | undefined;
  const userId = user?.id || (c.get('userId') as string | undefined);

  if (!storeId) {
    throw new SystemError({
      code: 'STORE_NOT_FOUND',
      category: 'security',
      severity: 'warning',
      userMessage: 'معرف المتجر مفقود من الطلب.',
      technicalMessage: 'Header x-store-id is missing.',
      metadata: { path: c.req.path },
    });
  }

  if (!userId) {
    throw new SystemError({
      code: 'FORBIDDEN',
      category: 'security',
      severity: 'warning',
      userMessage: 'غير مصرح للوصول.',
      technicalMessage: 'User ID missing in request context.',
      storeId,
      metadata: { path: c.req.path },
    });
  }

  const db = getDb({ DB: c.env.DB });
  const store = await db
    .select({ id: stores.id, ownerId: stores.ownerId })
    .from(stores)
    .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
    .get();

  if (!store || store.ownerId !== userId) {
    throw new SystemError({
      code: 'FORBIDDEN',
      category: 'security',
      severity: 'warning',
      userMessage: 'ليس لديك صلاحية الوصول لوسائط هذا المتجر.',
      technicalMessage: `User ${userId} attempted unauthorized media operation on store ${storeId}`,
      shouldAlert: true,
      storeId,
      metadata: { path: c.req.path, userId },
    });
  }

  return { storeId, userId };
}

// ============================================================
// 🛠️ Helper: توليد Pre-Signed URL لـ Backblaze B2
// ============================================================
async function getB2PresignedUrl(
  env: AppEnv['Bindings'],
  key: string,
  contentType: string
): Promise<string> {
  const endpoint = (env.B2_ENDPOINT || '').replace(/\/$/, '');
  const regionMatch = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/);
  const region = regionMatch ? regionMatch[1] : 'us-west-004';

  const client = new AwsClient({
    accessKeyId: env.B2_ACCESS_KEY_ID,
    secretAccessKey: env.B2_SECRET_ACCESS_KEY,
    service: 's3',
    region,
  });

  const url = `${endpoint}/${env.B2_BUCKET_NAME}/${key}`;

  const signedRequest = await client.sign(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    aws: { signQuery: true },
  });

  return signedRequest.url;
}

// ============================================================
// 🚀 المسارات (Routes)
// ============================================================

/**
 * GET /api/media/cloudinary-config
 */
mediaRouter.get('/media/cloudinary-config', requireAuth, (c) =>
  safeExecute(async () => {
    const { storeId } = await verifyStoreOwnership(c);
    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ cloudinaryAccountIndex: stores.cloudinaryAccountIndex })
      .from(stores)
      .where(eq(stores.id, storeId))
      .get();

    const account = getStoreCloudinaryAccount(
      store?.cloudinaryAccountIndex,
      c.env
    );

    if (!account) {
      throw new SystemError({
        code: 'CLOUDINARY_NOT_CONFIGURED',
        category: 'system',
        severity: 'critical',
        userMessage: 'لم يتم العثور على حساب وسائط معتمد لهذا المتجر.',
        technicalMessage: `Cloudinary account not found for store ${storeId}`,
        shouldAlert: true,
        storeId,
      });
    }

    return c.json(
      {
        success: true,
        data: {
          accountIndex: account.id,
          cloudName: account.cloudName,
          apiKey: account.apiKey,
          uploadPreset: account.uploadPreset,
        },
      },
      200
    );
  })
);

/**
 * POST /api/media/cloudinary-sign
 */
mediaRouter.post('/media/cloudinary-sign', requireAuth, (c) =>
  safeExecute(async () => {
    const { storeId } = await verifyStoreOwnership(c);
    const db = getDb({ DB: c.env.DB });

    const store = await db
      .select({ cloudinaryAccountIndex: stores.cloudinaryAccountIndex })
      .from(stores)
      .where(eq(stores.id, storeId))
      .get();

    const account = getStoreCloudinaryAccount(
      store?.cloudinaryAccountIndex,
      c.env
    );

    if (!account || !account.apiSecret) {
      throw new SystemError({
        code: 'CLOUDINARY_NOT_CONFIGURED',
        category: 'system',
        severity: 'critical',
        userMessage: 'تكوين Cloudinary غير مكتمل، يرجى التواصل مع الدعم.',
        technicalMessage: `Cloudinary API secret is missing for account index ${account?.id}`,
        shouldAlert: true,
        storeId,
        metadata: { accountId: account?.id },
      });
    }

    const body = await c.req.json<{
      publicId?: string;
      folder?: string;
      resourceType?: 'image' | 'video' | 'raw';
      tags?: string[];
      transformation?: string;
    }>();

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = body.folder || `stores/${storeId}`;
    const publicId =
      body.publicId || `media_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const resourceType = body.resourceType || 'image';

    const params: Record<string, string | number> = {
      folder,
      public_id: publicId,
      timestamp,
      ...(body.tags && body.tags.length > 0 ? { tags: body.tags.join(',') } : {}),
      ...(body.transformation ? { transformation: body.transformation } : {}),
    };

    const sortedKeys = Object.keys(params).sort();
    const signatureString =
      sortedKeys.map((key) => `${key}=${params[key]}`).join('&') + account.apiSecret;

    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const signature = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return c.json(
      {
        success: true,
        data: {
          signature,
          timestamp,
          cloudName: account.cloudName,
          apiKey: account.apiKey,
          publicId,
          folder,
          resourceType,
          uploadPreset: account.uploadPreset,
        },
      },
      200
    );
  })
);

/**
 * POST /api/media/upload-url
 * توليد Pre-Signed URL مع دعم التمييز التلقائي للنوع والتحقق بـ Zod
 */
mediaRouter.post('/media/upload-url', requireAuth, (c) =>
  safeExecute(async () => {
    const { storeId } = await verifyStoreOwnership(c);
    const { B2_ENDPOINT, B2_BUCKET_NAME, B2_ACCESS_KEY_ID } = c.env;

    if (!B2_ENDPOINT || !B2_BUCKET_NAME || !B2_ACCESS_KEY_ID) {
      throw new SystemError({
        code: 'B2_NOT_CONFIGURED',
        category: 'system',
        severity: 'critical',
        userMessage: 'إعدادات التخزين السحابي B2 غير مكتملة.',
        technicalMessage:
          'B2 Storage configuration is missing in Cloudflare environment bindings.',
        shouldAlert: true,
        storeId,
      });
    }

    const rawBody = await c.req.json<{ type?: 'image' | 'video'; mimeType?: string }>();

    const isVideo =
      rawBody.type === 'video' ||
      (typeof rawBody.mimeType === 'string' && rawBody.mimeType.startsWith('video/'));
    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

    const validatedData = isVideo
      ? videoUploadSchema.parse(rawBody)
      : imageUploadSchema.parse(rawBody);

    const fileExt = validatedData.fileName.split('.').pop() || 'bin';
    const uniqueKey = `stores/${storeId}/${mediaType}s/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;

    const uploadUrl = await getB2PresignedUrl(c.env, uniqueKey, validatedData.mimeType);

    return c.json(
      {
        success: true,
        data: {
          uploadUrl,
          fileKey: uniqueKey,
          bucketName: B2_BUCKET_NAME,
          resourceType: mediaType,
        },
      },
      200
    );
  })
);

/**
 * POST /api/media/confirm
 */
mediaRouter.post('/media/confirm', requireAuth, (c) =>
  safeExecute(async () => {
    const { storeId } = await verifyStoreOwnership(c);
    const body = await c.req.json<{
      url: string;
      originalUrl?: string;
      type: 'image' | 'video' | 'document';
      mimeType: string;
      filename: string;
      size: number;
      productId?: string;
      categoryId?: string;
      isPrimary?: boolean;
      order?: number;
      metadata?: Record<string, unknown>;
    }>();

    if (!body.url || !body.filename || !body.size || !body.type || !body.mimeType) {
      throw new SystemError({
        code: 'INVALID_MEDIA_DATA',
        category: 'validation',
        severity: 'info',
        userMessage: 'بيانات الوسائط المرفوعة غير مكتملة.',
        technicalMessage: 'Missing required media parameters in confirm body',
        storeId,
      });
    }

    const db = getDb({ DB: c.env.DB });

    const [inserted] = await db
      .insert(media)
      .values({
        storeId,
        productId: body.productId || null,
        categoryId: body.categoryId || null,
        url: body.url,
        originalUrl: body.originalUrl || body.url,
        type: body.type,
        mimeType: body.mimeType,
        filename: body.filename,
        size: body.size,
        isPrimary: body.isPrimary || false,
        order: body.order || 0,
        metadata: body.metadata || {},
      })
      .returning();

    if (inserted) {
      await queueMediaProcessing(c.env, inserted.id);
    }

    return c.json(
      {
        success: true,
        message: 'تم تسجيل الملف بنجاح وإرساله للطابور للمعالجة.',
        data: inserted,
      },
      200
    );
  })
);

/**
 * DELETE /api/media
 */
mediaRouter.delete('/media', requireAuth, (c) =>
  safeExecute(async () => {
    const { storeId } = await verifyStoreOwnership(c);
    const rawBody = await c.req.json();
    const body = deleteMediaSchema.parse(rawBody);

    const db = getDb({ DB: c.env.DB });

    const updated = await db
      .update(media)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(media.id, body.mediaId),
          eq(media.storeId, storeId),
          eq(media.productId, body.productId)
        )
      )
      .returning();

    if (!updated.length) {
      throw new SystemError({
        code: 'MEDIA_NOT_FOUND',
        category: 'business',
        severity: 'info',
        userMessage: 'الملف غير موجود أو تم حذفه مسبقاً.',
        technicalMessage: `Media ${body.mediaId} not found or soft-deleted for store ${storeId}`,
        storeId,
        metadata: { mediaId: body.mediaId, productId: body.productId },
      });
    }

    return c.json(
      {
        success: true,
        message: 'تم حذف الملف بنجاح.',
      },
      200
    );
  })
);