// features/store-editor/server/editorActions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createAuth } from '@/lib/auth';
import { getDb, type D1Transaction } from '@/lib/db';
import { products, media, stores } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { idempotency } from '@/lib/idempotency';
import { queueMediaProcessing } from '@/lib/queue';
import type { Env } from '@/lib/env';

export type QuickProductState = {
  success?: boolean;
  productId?: string | null;
  mediaId?: string | null;
  error?: string | null;
};

function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0621-\u064A-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || `product-${Date.now()}`;
}

/**
 * 🌐 دالة ذكية لجلب بيئة التشغيل (تتعامل مع Cloudflare في الإنتاج و npm run dev محلياً)
 */
async function getEnv(): Promise<Env> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext();
    
    // عمل Type Casting صريح لـ ctx.env ليطابق نوع Env المعتمد في تطبيقك
    const cfEnv = ctx?.env as unknown as Env;
    if (cfEnv?.DB) {
      return cfEnv;
    }
  } catch {
    // بيئة next dev المحلية
  }

  // في حالة عدم وجود D1 محلياً في بيئة التطوير
  const localEnv = process.env as unknown as Env;
  
  if (process.env.NODE_ENV === 'development' && !localEnv.DB) {
    const dummyD1 = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ success: true }),
        }),
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
      exec: async () => {},
    };

    return {
      ...localEnv,
      DB: dummyD1 as unknown as Env['DB'],
    };
  }

  return localEnv;
}
/**
 * Server Action متوافق مع React useActionState
 */
export async function createQuickProduct(
  prevState: QuickProductState,
  formData: FormData
): Promise<QuickProductState> {
  // جلب البيئة التلقائية المحدثة
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

  // 2️⃣ Idempotency Key validation
  const idempotencyKey = formData.get('idempotencyKey') as string;
  if (!idempotencyKey) {
    return { success: false, error: 'معرف الطلب غير صالح' };
  }

  // 3️⃣ Ownership validation
  const storeId = formData.get('storeId') as string;
  if (!storeId) {
    return { success: false, error: 'معرف المتجر مفقود' };
  }

  const store = await db.query.stores.findFirst({
    where: eq(stores.id, storeId),
  });

  if (!store || store.ownerId !== session.user.id) {
    return { success: false, error: 'لا تملك صلاحية إضافة منتجات لهذا المتجر' };
  }

  // 4️⃣ Inputs Validation
  const name = (formData.get('name') as string)?.trim();
  const rawPriceCents = parseInt(formData.get('priceCents') as string);
  const tempUrl = formData.get('tempUrl') as string;

  if (!name) {
    return { success: false, error: 'يرجى إدخال اسم المنتج' };
  }

  if (isNaN(rawPriceCents) || rawPriceCents <= 0) {
    return { success: false, error: 'يرجى إدخال سعر صحيح' };
  }

  if (!tempUrl) {
    return { success: false, error: 'يرجى رفع صورة للمنتج' };
  }

  // 5️⃣ تنفيذ العملية عبر Idempotency Executor
  try {
    const result = await idempotency.execute(env, idempotencyKey, async () => {
      const priceFormatted = (rawPriceCents / 100).toFixed(2);
      const baseSlug = slugify(name);
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

      const productId = crypto.randomUUID();
      const mediaId = crypto.randomUUID();
      const filename = tempUrl.split('/').pop() || `${Date.now()}.jpg`;

      // 6️⃣ Atomic Database Transaction
      await db.transaction(async (tx: D1Transaction) => {
        await tx.insert(products).values({
          id: productId,
          storeId,
          name,
          slug,
          price: priceFormatted,
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

      // 7️⃣ Queue background processing
      await queueMediaProcessing(env, mediaId);

      // 8️⃣ Revalidate cache
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