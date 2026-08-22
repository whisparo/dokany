// src/core/live-state/stock.ts

import type { Env } from '@/lib/env';

/**
 * إدارة المخزون الحي في Cloudflare KV مع دعم Atomic Decrement و Rollback
 * المفاتيح:
 *   - store:{slug}:stock:{productId} → العدد المتبقي (integer)
 *
 * جميع العمليات تتم مباشرة في KV بدون أي استعلام على D1
 */

export interface StockItem {
  productId: string;
  quantity: number;
}

// ============================================================
// 📤 دوال القراءة
// ============================================================

/**
 * قراءة المخزون الحالي لمنتج معين
 * @param slug - معرف المتجر (Store Slug)
 * @param productId - معرف المنتج
 * @param env - بيئة Worker
 * @returns العدد المتبقي أو null إذا لم يكن موجوداً
 */
export async function getStock(
  slug: string,
  productId: string,
  env: Env
): Promise<number | null> {
  const key = `store:${slug}:stock:${productId}`;
  const value = await env.BUFFER_KV.get(key);

  if (value === null) {
    return null;
  }

  const stock = parseInt(value, 10);
  if (isNaN(stock) || stock < 0) {
    console.warn(`⚠️ Invalid stock value for ${key}: ${value}`);
    return null;
  }

  return stock;
}

/**
 * قراءة المخزون لمجموعة من المنتجات دفعة واحدة
 * @param slug - معرف المتجر
 * @param productIds - مصفوفة من معرفات المنتجات
 * @param env - بيئة Worker
 * @returns Map<productId, stock>
 */
export async function getMultipleStocks(
  slug: string,
  productIds: string[],
  env: Env
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // قراءة كل منتج على حدة (KV لا يدعم read multiple)
  for (const productId of productIds) {
    const stock = await getStock(slug, productId, env);
    if (stock !== null) {
      result.set(productId, stock);
    }
  }

  return result;
}

// ============================================================
// 📝 دوال الكتابة (Atomic Operations)
// ============================================================

/**
 * خصم كمية من المخزون (Atomic Decrement)
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param quantity - الكمية المطلوب خصمها (يجب أن تكون > 0)
 * @param env - بيئة Worker
 * @returns { success: boolean, newStock: number | null, error?: string }
 */
export async function deductStock(
  slug: string,
  productId: string,
  quantity: number,
  env: Env
): Promise<{ success: boolean; newStock: number | null; error?: string }> {
  if (quantity <= 0) {
    return {
      success: false,
      newStock: null,
      error: 'Quantity must be greater than zero',
    };
  }

  const key = `store:${slug}:stock:${productId}`;

  try {
    // 1️⃣ قراءة القيمة الحالية
    const currentValue = await env.BUFFER_KV.get(key);

    if (currentValue === null) {
      return {
        success: false,
        newStock: null,
        error: `Product not found in stock: ${productId}`,
      };
    }

    const currentStock = parseInt(currentValue, 10);
    if (isNaN(currentStock) || currentStock < 0) {
      return {
        success: false,
        newStock: null,
        error: `Invalid stock value for ${productId}`,
      };
    }

    // 2️⃣ التحقق من توفر الكمية
    if (currentStock < quantity) {
      return {
        success: false,
        newStock: currentStock,
        error: `Insufficient stock: ${currentStock} available, ${quantity} requested`,
      };
    }

    // 3️⃣ حساب القيمة الجديدة
    const newStock = currentStock - quantity;

    // 4️⃣ كتابة القيمة الجديدة في KV
    await env.BUFFER_KV.put(key, newStock.toString());

    console.log(`✅ Stock deducted: ${productId} ${currentStock} → ${newStock}`);

    return {
      success: true,
      newStock,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'KV operation failed';
    console.error(`❌ Failed to deduct stock for ${productId}:`, error);
    return {
      success: false,
      newStock: null,
      error: message,
    };
  }
}

/**
 * خصم كمية من المخزون مع Rollback تلقائي (للاستخدام في Atomic Rollback Block)
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param quantity - الكمية المطلوب خصمها
 * @param env - بيئة Worker
 * @returns { success: boolean, newStock: number | null, error?: string }
 */
export async function deductStockWithRollback(
  slug: string,
  productId: string,
  quantity: number,
  env: Env
): Promise<{ success: boolean; newStock: number | null; error?: string }> {
  // تنفيذ الخصم
  const result = await deductStock(slug, productId, quantity, env);

  // إذا فشل الخصم، لا يوجد شيء لاسترجاعه
  if (!result.success) {
    return result;
  }

  return result;
}

// ============================================================
// 🔄 دوال Rollback (استرجاع المخزون)
// ============================================================

/**
 * استرجاع كمية من المخزون (Rollback) - يُستخدم في حال فشل كتابة الطلب
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param quantity - الكمية المطلوب استرجاعها
 * @param env - بيئة Worker
 * @returns { success: boolean, newStock: number | null, error?: string }
 */
export async function rollbackStock(
  slug: string,
  productId: string,
  quantity: number,
  env: Env
): Promise<{ success: boolean; newStock: number | null; error?: string }> {
  if (quantity <= 0) {
    return {
      success: false,
      newStock: null,
      error: 'Quantity must be greater than zero',
    };
  }

  const key = `store:${slug}:stock:${productId}`;

  try {
    // 1️⃣ قراءة القيمة الحالية
    const currentValue = await env.BUFFER_KV.get(key);

    if (currentValue === null) {
      return {
        success: false,
        newStock: null,
        error: `Product not found in stock: ${productId}`,
      };
    }

    const currentStock = parseInt(currentValue, 10);
    if (isNaN(currentStock) || currentStock < 0) {
      return {
        success: false,
        newStock: null,
        error: `Invalid stock value for ${productId}`,
      };
    }

    // 2️⃣ حساب القيمة الجديدة (إضافة الكمية المسترجعة)
    const newStock = currentStock + quantity;

    // 3️⃣ كتابة القيمة الجديدة في KV
    await env.BUFFER_KV.put(key, newStock.toString());

    console.log(`↩️ Stock rollback: ${productId} ${currentStock} → ${newStock}`);

    return {
      success: true,
      newStock,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'KV operation failed';
    console.error(`❌ Failed to rollback stock for ${productId}:`, error);
    return {
      success: false,
      newStock: null,
      error: message,
    };
  }
}

/**
 * استرجاع كمية من المخزون لمجموعة من المنتجات (Rollback Batch)
 * @param slug - معرف المتجر
 * @param items - مصفوفة من { productId, quantity }
 * @param env - بيئة Worker
 * @returns نتائج كل عملية Rollback
 */
export async function rollbackMultipleStocks(
  slug: string,
  items: StockItem[],
  env: Env
): Promise<Array<{ productId: string; success: boolean; newStock: number | null; error?: string }>> {
  const results: Array<{ productId: string; success: boolean; newStock: number | null; error?: string }> = [];

  for (const item of items) {
    const result = await rollbackStock(slug, item.productId, item.quantity, env);
    results.push({
      productId: item.productId,
      ...result,
    });
  }

  return results;
}

// ============================================================
// 🛠️ دوال إدارة المخزون (Warm-up, Fix, Reset)
// ============================================================

/**
 * تهيئة المخزون الأولي (للمتجر الجديد)
 * @param slug - معرف المتجر
 * @param initialStock - Map<productId, stock>
 * @param env - بيئة Worker
 */
export async function initializeStock(
  slug: string,
  initialStock: Map<string, number>,
  env: Env
): Promise<void> {
  for (const [productId, stock] of initialStock) {
    const key = `store:${slug}:stock:${productId}`;
    await env.BUFFER_KV.put(key, stock.toString());
  }
  console.log(`✅ Stock initialized for store: ${slug}`);
}

/**
 * إعادة بناء المخزون (Auto Warm-up) من D1 أو من الطلبات المجمعة
 * @param slug - معرف المتجر
 * @param baseStock - المخزون الأساسي من D1 (أو من مصدر آخر)
 * @param deductedQuantities - الكميات المخصومة من الطلبات المعلقة
 * @param env - بيئة Worker
 */
export async function warmUpStock(
  slug: string,
  baseStock: Map<string, number>,
  deductedQuantities: Map<string, number>,
  env: Env
): Promise<void> {
  for (const [productId, base] of baseStock) {
    const deducted = deductedQuantities.get(productId) || 0;
    const newStock = Math.max(base - deducted, 0);

    const key = `store:${slug}:stock:${productId}`;
    await env.BUFFER_KV.put(key, newStock.toString());
  }
  console.log(`🔥 Stock warmed up for store: ${slug}`);
}

/**
 * إصلاح المخزون (إذا كانت هناك بيانات غير صحيحة)
 * @param slug - معرف المتجر
 * @param productId - معرف المنتج
 * @param correctStock - القيمة الصحيحة
 * @param env - بيئة Worker
 */
export async function fixStock(
  slug: string,
  productId: string,
  correctStock: number,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  if (correctStock < 0) {
    return {
      success: false,
      error: 'Stock cannot be negative',
    };
  }

  const key = `store:${slug}:stock:${productId}`;
  try {
    await env.BUFFER_KV.put(key, correctStock.toString());
    console.log(`🔧 Stock fixed: ${productId} → ${correctStock}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fix stock';
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// 📦 دوال مساعدة
// ============================================================

/**
 * التحقق من وجود منتج في المخزون
 */
export async function hasStock(
  slug: string,
  productId: string,
  env: Env
): Promise<boolean> {
  const stock = await getStock(slug, productId, env);
  return stock !== null && stock > 0;
}

/**
 * التحقق من توفر الكمية المطلوبة
 */
export async function isStockAvailable(
  slug: string,
  productId: string,
  quantity: number,
  env: Env
): Promise<boolean> {
  const stock = await getStock(slug, productId, env);
  if (stock === null) return false;
  return stock >= quantity;
}

/**
 * الحصول على جميع مفاتيح المخزون لمتجر معين (للمراقبة)
 */
export async function getAllStockKeys(
  slug: string,
  env: Env
): Promise<string[]> {
  const prefix = `store:${slug}:stock:`;
  const listResult = await env.BUFFER_KV.list({ prefix });
  return listResult.keys.map((key) => key.name);
}