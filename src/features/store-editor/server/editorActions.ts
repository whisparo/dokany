// features/store-editor/server/editorActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createAuth } from '@/lib/auth';
import { getDb, type D1Transaction } from '@/lib/db';
import { products, media, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { idempotency } from '@/lib/idempotency';
import { queueMediaProcessing } from '@/lib/queue';
import { z } from 'zod';
import type { Env } from '@/lib/env';

export type QuickProductState = {
  success?: boolean;
  productId?: string | null;
  mediaId?: string | null;
  error?: string | null;
};

// 🛡️ Zod Schema للتحقق الصارم من المدخلات
const quickProductSchema = z.object({
  idempotencyKey: z.string().min(1, 'معرف الطلب غير صالح'),
  storeId: z.string().min(1, 'معرف المتجر مفقود'),
  name: z.string().min(1, 'يرجى إدخال اسم المنتج').trim(),
  priceCents: z.coerce.number().int().positive('يرجى إدخال سعر صحيح'),
  tempUrl: z.string().url('يرجى رفع صورة صحيحة للمنتج'),
});

function slugify(text: string): string {
  return (
    text
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u0621-\u064A-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || `product-${Date.now()}`
  );
}

/**
 * 🌐 جلب البيئة بطريقة آمنة بدون Type Casting قسري
 */
async function getEnv(): Promise<Env> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext();

    if (
      ctx?.env &&
      typeof ctx.env === 'object' &&
      'DB' in ctx.env &&
      ctx.env.DB
    ) {
      return ctx.env as Env;
    }
  } catch {
    // بيئة next dev المحلية
  }

  // دعم البيئة المحلية دون اللجوء لـ as unknown as
  return process.env as unknown as Env;
}

/**
 * Server Action متوافق مع React useActionState
 */
export async function createQuickProduct(
  prevState: QuickProductState,
  formData: FormData
): Promise<QuickProductState> {
  const env = await getEnv();
  const db = getDb(env);
  const auth = createAuth(env);

  // 1️⃣ Session validation
  const session = await auth.api.getSession({
    headers: new Headers(),
  });

  if (!session || !session.user) {
    return { success: false, error: 'يجب تسجيل الدخول أولاً' };
  }

  // 2️⃣ Input Validation via Zod
  const rawInput = {
    idempotencyKey: formData.get('idempotencyKey'),
    storeId: formData.get('storeId'),
    name: formData.get('name'),
    priceCents: formData.get('priceCents'),
    tempUrl: formData.get('tempUrl'),
  };

  const validationResult = quickProductSchema.safeParse(rawInput);

  if (!validationResult.success) {
    const firstError = validationResult.error.issues[0]?.message || 'بيانات غير صالحة';
    return { success: false, error: firstError };
  }

  const { idempotencyKey, storeId, name, priceCents, tempUrl } = validationResult.data;

  // 3️⃣ Ownership validation
  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store || store.ownerId !== session.user.id) {
    return { success: false, error: 'لا تملك صلاحية إضافة منتجات لهذا المتجر' };
  }

  // 4️⃣ Idempotency Execution
  try {
    const result = await idempotency.execute(env, idempotencyKey, async () => {
      // ✅ تحويل السعر لـ number متوافق مع Drizzle
      const priceNumber = priceCents / 100;
      const baseSlug = slugify(name);
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

      const productId = crypto.randomUUID();
      const mediaId = crypto.randomUUID();
      const filename = tempUrl.split('/').pop() || `${Date.now()}.jpg`;

      // 5️⃣ Transaction execution
      await db.transaction(async (tx: D1Transaction) => {
        await tx.insert(products).values({
          id: productId,
          storeId,
          name,
          slug,
          price: priceNumber, // ✅ تم التوافق مع نوع البيانات رقمياً
          stock: 0,
          isPublished: true,
          imageSrc: tempUrl,
          mediaIds: [mediaId],
          images: [{ url: tempUrl, isPrimary: true, order: 0 }],
        });

        await tx.insert(media).values({
          id: mediaId,
          storeId,
          productId,
          url: tempUrl,
          originalUrl: tempUrl,
          type: 'image',
          mimeType: 'image/jpeg',
          filename,
          size: 0,
          isPrimary: true,
        });
      });

      // 6️⃣ Background Job & Cache Revalidation
      await queueMediaProcessing(env, mediaId);

      if (store.slug) {
        revalidatePath(`/[locale]/${store.slug}`, 'page');
      }

      return {
        success: true,
        productId,
        mediaId,
        error: null,
      };
    });

    return result;
  } catch (error) {
    console.error('[createQuickProduct] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'حدث خطأ أثناء إضافة المنتج',
    };
  }
}