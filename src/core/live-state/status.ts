// src/core/live-state/status.ts

/**
 * إدارة حالة المتجر في Cloudflare KV
 * المفاتيح:
 *   - store:{slug}:status → "active" | "maintenance"
 *
 * يتم تحديث الحالة من لوحة التحكم فقط، ولا تتغير أثناء التشغيل العادي
 */

import type { Env } from '@/lib/env';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

/** الحالات المسموح بها للمتجر */
export type StoreStatus = 'active' | 'maintenance';

/** التحقق من صحة قيمة الحالة */
export function isValidStatus(value: unknown): value is StoreStatus {
  return value === 'active' || value === 'maintenance';
}

// ============================================================
// 🧠 دوال مساعدة داخلية
// ============================================================

/** توليد مفتاح KV للحالة */
function getStatusKey(slug: string): string {
  return `store:${slug}:status`;
}

// ============================================================
// 📤 دوال القراءة
// ============================================================

/**
 * قراءة الحالة الحالية للمتجر
 * @param slug - معرف المتجر (Store Slug)
 * @param env - بيئة Worker
 * @returns الحالة أو null إذا لم تكن محددة
 */
export async function getStatus(
  slug: string,
  env: Env
): Promise<StoreStatus | null> {
  const key = getStatusKey(slug);
  const value = await env.BUFFER_KV.get(key);

  if (!value) {
    return null;
  }

  if (!isValidStatus(value)) {
    console.warn(`⚠️ Invalid status value for ${slug}: ${value}`);
    return null;
  }

  return value;
}

/**
 * التحقق من وجود حالة للمتجر (مع قراءة القيمة)
 * @returns الحالة أو null إذا كانت غير موجودة أو غير صالحة
 */
export async function getStatusOrDefault(
  slug: string,
  env: Env,
  defaultStatus: StoreStatus = 'active'
): Promise<StoreStatus> {
  const status = await getStatus(slug, env);
  return status ?? defaultStatus;
}

// ============================================================
// 📝 دوال الكتابة
// ============================================================

/**
 * تعيين حالة المتجر (من لوحة التحكم)
 * @param slug - معرف المتجر
 * @param status - الحالة الجديدة ('active' | 'maintenance')
 * @param env - بيئة Worker
 * @returns { success: boolean; error?: string }
 */
export async function setStatus(
  slug: string,
  status: StoreStatus,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  if (!isValidStatus(status)) {
    return {
      success: false,
      error: `Invalid status value: "${status}". Must be 'active' or 'maintenance'.`,
    };
  }

  const key = getStatusKey(slug);

  try {
    await env.BUFFER_KV.put(key, status);
    console.log(`✅ Store status updated: ${slug} → ${status}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KV error';
    console.error(`❌ Failed to set status for ${slug}:`, error);
    return {
      success: false,
      error: `KV write failed: ${message}`,
    };
  }
}

/**
 * تحديث الحالة مع التحقق من القيمة القديمة (للـ idempotency)
 * @param slug - معرف المتجر
 * @param newStatus - الحالة الجديدة
 * @param env - بيئة Worker
 * @returns { success: boolean; oldStatus?: StoreStatus | null; error?: string }
 */
export async function updateStatus(
  slug: string,
  newStatus: StoreStatus,
  env: Env
): Promise<{ success: boolean; oldStatus?: StoreStatus | null; error?: string }> {
  if (!isValidStatus(newStatus)) {
    return {
      success: false,
      error: `Invalid status value: "${newStatus}". Must be 'active' or 'maintenance'.`,
    };
  }

  const key = getStatusKey(slug);

  try {
    // 1️⃣ قراءة الحالة القديمة
    const currentValue = await env.BUFFER_KV.get(key);
    const oldStatus = currentValue && isValidStatus(currentValue) ? currentValue : null;

    // 2️⃣ كتابة الحالة الجديدة
    await env.BUFFER_KV.put(key, newStatus);

    console.log(`🔄 Store status updated: ${slug} ${oldStatus} → ${newStatus}`);

    return {
      success: true,
      oldStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KV error';
    console.error(`❌ Failed to update status for ${slug}:`, error);
    return {
      success: false,
      error: `KV operation failed: ${message}`,
    };
  }
}

// ============================================================
// 🔄 دوال Rollback (استرجاع الحالة القديمة)
// ============================================================

/**
 * استرجاع الحالة إلى القيمة السابقة (في حال فشل عملية أخرى)
 * @param slug - معرف المتجر
 * @param oldStatus - الحالة القديمة (يمكن أن تكون null)
 * @param env - بيئة Worker
 * @returns { success: boolean; error?: string }
 */
export async function rollbackStatus(
  slug: string,
  oldStatus: StoreStatus | null,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  const key = getStatusKey(slug);

  try {
    if (oldStatus === null) {
      // إذا لم تكن هناك حالة سابقة، نحذف المفتاح
      await env.BUFFER_KV.delete(key);
      console.log(`🗑️ Status key deleted for ${slug} (rollback)`);
    } else {
      await env.BUFFER_KV.put(key, oldStatus);
      console.log(`↩️ Status rollback: ${slug} → ${oldStatus}`);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KV error';
    console.error(`❌ Failed to rollback status for ${slug}:`, error);
    return {
      success: false,
      error: `KV operation failed: ${message}`,
    };
  }
}

// ============================================================
// 🛠️ دوال مساعدة وإدارة
// ============================================================

/**
 * التحقق من وجود حالة للمتجر
 */
export async function hasStatus(slug: string, env: Env): Promise<boolean> {
  const key = getStatusKey(slug);
  const value = await env.BUFFER_KV.get(key);
  return value !== null;
}

/**
 * تهيئة الحالة الافتراضية للمتجر الجديد (وضعها 'active')
 */
export async function initializeStatus(
  slug: string,
  env: Env,
  initialStatus: StoreStatus = 'active'
): Promise<{ success: boolean; error?: string }> {
  const key = getStatusKey(slug);

  // التحقق من وجود حالة مسبقة
  const existing = await env.BUFFER_KV.get(key);
  if (existing) {
    console.warn(`⚠️ Status already exists for ${slug}, skipping initialization`);
    return { success: false, error: 'Status already exists' };
  }

  if (!isValidStatus(initialStatus)) {
    return {
      success: false,
      error: `Invalid initial status: "${initialStatus}"`,
    };
  }

  try {
    await env.BUFFER_KV.put(key, initialStatus);
    console.log(`✅ Status initialized for ${slug}: ${initialStatus}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown KV error';
    return {
      success: false,
      error: `KV write failed: ${message}`,
    };
  }
}

/**
 * الحصول على جميع مفاتيح الحالة (ل للمراقبة)
 */
export async function getAllStatusKeys(env: Env): Promise<string[]> {
  const listResult = await env.BUFFER_KV.list({ prefix: 'store:' });
  // فلترة المفاتيح التي تنتهي بـ ':status'
  return listResult.keys
    .map((key) => key.name)
    .filter((name) => name.endsWith(':status'));
}

// ============================================================
// 🔥 Auto Warm-up (إعادة بناء الحالة من D1)
// ============================================================

/**
 * إعادة بناء الحالة من D1 (في حال فقدان الكاش)
 * @param slug - معرف المتجر
 * @param storeId - معرف المتجر (للاستعلام في D1)
 * @param env - بيئة Worker
 * @returns الحالة المعاد بناؤها أو null
 */
export async function warmUpStatus(
  slug: string,
  storeId: string,
  env: Env
): Promise<StoreStatus | null> {
  console.log(`🔥 Warming up status for ${slug} from D1...`);

  try {
    const result = await env.DB.prepare(
      `SELECT status FROM store_settings WHERE store_id = ?`
    ).bind(storeId).first<{ status: string }>();

    if (!result) {
      console.warn(`⚠️ No status found in D1 for store ${storeId}, using default 'active'`);
      await setStatus(slug, 'active', env);
      return 'active';
    }

    const statusFromDb = result.status;
    if (!isValidStatus(statusFromDb)) {
      console.warn(`⚠️ Invalid status from D1: ${statusFromDb}, using default 'active'`);
      await setStatus(slug, 'active', env);
      return 'active';
    }

    await setStatus(slug, statusFromDb, env);
    console.log(`✅ Status warmed up for ${slug}: ${statusFromDb}`);
    return statusFromDb;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to warm up status for ${slug}:`, message);
    return null;
  }
}