// src/core/live-state/price.ts

/**
 * إدارة الأسعار الحية في Cloudflare KV مع دعم التحديثات والاستعلامات الذرية
 * المفاتيح:
 *   - store:{slug}:price:{productId} → السعر الحالي (integer)
 * جميع العمليات تتم مباشرة في KV بدون استعلامات على D1 في أثناء التصفح العادي
 */

import type { Env } from '@/lib/env';

// ============================================================
// 📤 دوال القراءة
// ============================================================

/**
 * قراءة السعر الحالي لمنتج معين
 * @param slug - معرف المتجر (Store Slug)
 * @param productId - معرف المنتج
 * @param env - بيئة Worker
 * @returns السعر كـ integer أو null إذا لم يكن موجوداً
 */
export async function getPrice(
  slug: string,
  productId: string,
  env: Env
): Promise<number | null> {
  const key = `store:${slug}:price:${productId}`;
  const value = await env.BUFFER_KV.get(key);

  if (value === null) {
    return null;
  }

  const price = parseInt(value, 10);
  if (isNaN(price) || price < 0) {
    console.warn(`⚠️ Invalid price value for ${key}: ${value}`);
    return null;
  }

  return price;
}

/**
 * قراءة الأسعار لمجموعة من المنتجات دفعة واحدة
 * @param slug - معرف المتجر
 * @param productIds - مصفوفة من معرفات المنتجات
 * @param env - بيئة Worker
 * @returns Map<productId, price>
 */
export async function getMultiplePrices(
  slug: string,
  productIds: string[],
  env: Env
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  for (const productId of productIds) {
    const price = await getPrice(slug, productId, env);
    if (price !== null) {
      result.set(productId, price);
    }
  }

  return result;
}

// ============================================================
// 📝 دوال الكتابة (للـ Dashboard / التاجر)
// ============================================================

/**
 * تعيين سعر منتج (يُستخدم من لوحة التحكم عند تغيير التاجر للسعر)
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param price - السعر الجديد (integer)
 * @param env - بيئة Worker
 * @returns { success: boolean; error?: string }
 */
export async function setPrice(
  slug: string,
  productId: string,
  price: number,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  // التحقق من صحة السعر (غير سالب، عدد صحيح)
  if (price < 0 || !Number.isInteger(price)) {
    return {
      success: false,
      error: `Price must be a non-negative integer. Received: ${price}`,
    };
  }

  const key = `store:${slug}:price:${productId}`;

  try {
    await env.BUFFER_KV.put(key, price.toString());
    console.log(`✅ Price updated: ${productId} → ${price}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to set price for ${productId}:`, error);
    return {
      success: false,
      error: `KV write failed: ${message}`,
    };
  }
}

/**
 * تحديث السعر (مع التحقق من الوجود)
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param newPrice - السعر الجديد (integer)
 * @param env - بيئة Worker
 * @returns { success: boolean; oldPrice?: number | null; error?: string }
 */
export async function updatePrice(
  slug: string,
  productId: string,
  newPrice: number,
  env: Env
): Promise<{ success: boolean; oldPrice?: number | null; error?: string }> {
  // التحقق من صحة السعر
  if (newPrice < 0 || !Number.isInteger(newPrice)) {
    return {
      success: false,
      error: `Price must be a non-negative integer. Received: ${newPrice}`,
    };
  }

  const key = `store:${slug}:price:${productId}`;

  try {
    // 1️⃣ قراءة السعر القديم (إن وجد)
    const currentValue = await env.BUFFER_KV.get(key);
    const oldPrice = currentValue !== null ? parseInt(currentValue, 10) : null;

    // 2️⃣ كتابة السعر الجديد
    await env.BUFFER_KV.put(key, newPrice.toString());

    console.log(`🔄 Price updated: ${productId} ${oldPrice} → ${newPrice}`);

    return {
      success: true,
      oldPrice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to update price for ${productId}:`, error);
    return {
      success: false,
      error: `KV operation failed: ${message}`,
    };
  }
}

// ============================================================
// 🔄 دوال Rollback (للتراجع في حالة فشل العمليات)
// ============================================================

/**
 * استرجاع السعر القديم (Rollback) في حالة فشل عملية التحديث
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param oldPrice - السعر القديم (يمكن أن يكون null)
 * @param env - بيئة Worker
 * @returns { success: boolean; error?: string }
 */
export async function rollbackPrice(
  slug: string,
  productId: string,
  oldPrice: number | null,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  const key = `store:${slug}:price:${productId}`;

  try {
    if (oldPrice === null) {
      // إذا كان السعر القديم null، نحذف المفتاح
      await env.BUFFER_KV.delete(key);
      console.log(`🗑️ Price key deleted: ${productId}`);
    } else {
      await env.BUFFER_KV.put(key, oldPrice.toString());
      console.log(`↩️ Price rollback: ${productId} → ${oldPrice}`);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to rollback price for ${productId}:`, error);
    return {
      success: false,
      error: `KV operation failed: ${message}`,
    };
  }
}

// ============================================================
// 🛠️ دوال مساعدة
// ============================================================

/**
 * التحقق من وجود سعر لمنتج
 */
export async function hasPrice(
  slug: string,
  productId: string,
  env: Env
): Promise<boolean> {
  const price = await getPrice(slug, productId, env);
  return price !== null;
}

/**
 * التحقق من صحة السعر (عدد صحيح غير سالب)
 */
export function validatePrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isInteger(price) && price >= 0;
}

/**
 * الحصول على جميع مفاتيح الأسعار لمتجر معين (للمراقبة)
 */
export async function getAllPriceKeys(
  slug: string,
  env: Env
): Promise<string[]> {
  const prefix = `store:${slug}:price:`;
  const listResult = await env.BUFFER_KV.list({ prefix });
  return listResult.keys.map((key) => key.name);
}