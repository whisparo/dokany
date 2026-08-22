// src/core/live-state/stats.ts

/**
 * إدارة الإحصائيات اللحظية للمتجر في Cloudflare KV
 * المفاتيح:
 *   - store:{slug}:stats → { salesCount, orderCount, revenue, version }
 * 
 * يتم تحديث الإحصائيات مع كل طلب ناجح (غير متزامن بعد الرد على العميل)
 * جميع القيم المالية تُخزن كـ Integers (أصغر وحدة نقدية)
 */

import type { Env } from '@/lib/env';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

/**
 * هيكل الإحصائيات المخزنة في KV
 */
export interface StoreStats {
  /** إجمالي عدد المبيعات (عدد الطلبات الناجحة) */
  salesCount: number;
  /** عدد الطلبات الناجحة (مرادف لـ salesCount، احتفاظ للتوافق) */
  orderCount: number;
  /** إجمالي الإيرادات (بالسنت/القرش) */
  revenue: number;
  /** رقم الإصدار (للتحديثات الذرية) */
  version: number;
}

/**
 * القيم المطلوب إضافتها (Delta/Tolerances) للتحديث
 */
export interface StoreStatsInput {
  salesCount?: number;
  orderCount?: number;
  revenue?: number;
}

/**
 * إحصائيات مخزنة بشكل منفصل للقراءة السريعة (بدون version)
 */
export type StoreStatsSnapshot = Omit<StoreStats, 'version'>;

// ============================================================
// 🧠 دوال مساعدة داخلية
// ============================================================

/**
 * توليد مفتاح KV للإحصائيات
 */
function getStatsKey(slug: string): string {
  return `store:${slug}:stats`;
}

/**
 * التحقق من صحة كائن الإحصائيات بدون any
 */
function isValidStatsObject(data: unknown): data is StoreStats {
  if (!data || typeof data !== 'object') return false;
  const stats = data as Record<string, unknown>;
  return (
    typeof stats.salesCount === 'number' &&
    typeof stats.orderCount === 'number' &&
    typeof stats.revenue === 'number' &&
    typeof stats.version === 'number'
  );
}

// ============================================================
// 📤 دوال القراءة
// ============================================================

/**
 * قراءة الإحصائيات الحالية للمتجر
 */
export async function getStats(
  slug: string,
  env: Env
): Promise<StoreStatsSnapshot | null> {
  const key = getStatsKey(slug);
  const raw = await env.BUFFER_KV.get(key);

  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw);
    if (!isValidStatsObject(data)) {
      console.warn(`⚠️ Invalid stats structure for ${slug}: ${raw}`);
      return null;
    }

    const { version, ...snapshot } = data;
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error';
    console.error(`❌ Failed to parse stats for ${slug}:`, message);
    return null;
  }
}

/**
 * قراءة الإحصائيات مع الـ version (للتحديثات الذرية)
 */
async function getStatsWithVersion(
  slug: string,
  env: Env
): Promise<StoreStats | null> {
  const key = getStatsKey(slug);
  const raw = await env.BUFFER_KV.get(key);

  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw);
    if (!isValidStatsObject(data)) {
      console.warn(`⚠️ Invalid stats structure for ${slug}: ${raw}`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// ============================================================
// 📝 دوال الكتابة (التحديث الذري والتراكمي)
// ============================================================

/**
 * تحديث الإحصائيات بشكل تراكمي وذري
 */
export async function updateStats(
  slug: string,
  updates: StoreStatsInput,
  env: Env
): Promise<StoreStatsSnapshot | null> {
  const key = getStatsKey(slug);

  if (updates.revenue !== undefined && (updates.revenue < 0 || !Number.isInteger(updates.revenue))) {
    console.error(`❌ Invalid revenue delta: ${updates.revenue}`);
    return null;
  }
  if (updates.salesCount !== undefined && (updates.salesCount < 0 || !Number.isInteger(updates.salesCount))) {
    console.error(`❌ Invalid salesCount delta: ${updates.salesCount}`);
    return null;
  }
  if (updates.orderCount !== undefined && (updates.orderCount < 0 || !Number.isInteger(updates.orderCount))) {
    console.error(`❌ Invalid orderCount delta: ${updates.orderCount}`);
    return null;
  }

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const current = await getStatsWithVersion(slug, env);

      let newStats: StoreStats;
      if (!current) {
        newStats = {
          salesCount: updates.salesCount ?? 0,
          orderCount: updates.orderCount ?? 0,
          revenue: updates.revenue ?? 0,
          version: 1,
        };
      } else {
        // إضافة القيمة الجديدة للقديمة لتكون عملية تراكمية
        newStats = {
          salesCount: current.salesCount + (updates.salesCount ?? 0),
          orderCount: current.orderCount + (updates.orderCount ?? 0),
          revenue: current.revenue + (updates.revenue ?? 0),
          version: current.version + 1,
        };
      }

      await env.BUFFER_KV.put(key, JSON.stringify(newStats));

      const { version, ...result } = newStats;
      console.log(`📊 Stats updated for ${slug}: sales=${result.salesCount}, revenue=${result.revenue}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`⚠️ Stats update attempt ${attempt + 1} failed for ${slug}:`, message);
      attempt++;
    }
  }

  console.error(`❌ Failed to update stats for ${slug} after ${MAX_RETRIES} attempts`);
  return null;
}

// ============================================================
// 🔄 دوال Rollback (استرجاع الإحصائيات القديمة)
// ============================================================

export async function rollbackStats(
  slug: string,
  previousStats: StoreStatsSnapshot | null,
  env: Env
): Promise<boolean> {
  const key = getStatsKey(slug);

  try {
    if (previousStats === null) {
      await env.BUFFER_KV.delete(key);
      console.log(`🗑️ Stats deleted for ${slug} (rollback)`);
      return true;
    }

    const current = await getStatsWithVersion(slug, env);
    const newVersion = current ? current.version + 1 : 1;

    const statsToRestore: StoreStats = {
      ...previousStats,
      version: newVersion,
    };

    await env.BUFFER_KV.put(key, JSON.stringify(statsToRestore));
    console.log(`↩️ Stats rolled back for ${slug}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to rollback stats for ${slug}:`, message);
    return false;
  }
}

// ============================================================
// 🛠️ دوال مساعدة وإدارة
// ============================================================

export async function incrementStats(
  slug: string,
  orderTotal: number,
  env: Env
): Promise<StoreStatsSnapshot | null> {
  if (orderTotal < 0 || !Number.isInteger(orderTotal)) {
    console.error(`❌ Invalid orderTotal: ${orderTotal} (must be non-negative integer)`);
    return null;
  }

  return updateStats(slug, {
    salesCount: 1,
    orderCount: 1,
    revenue: orderTotal,
  }, env);
}

export async function initializeStats(
  slug: string,
  env: Env
): Promise<boolean> {
  const key = getStatsKey(slug);

  const existing = await env.BUFFER_KV.get(key);
  if (existing) {
    console.warn(`⚠️ Stats already exist for ${slug}, skipping initialization`);
    return false;
  }

  const initialStats: StoreStats = {
    salesCount: 0,
    orderCount: 0,
    revenue: 0,
    version: 1,
  };

  try {
    await env.BUFFER_KV.put(key, JSON.stringify(initialStats));
    console.log(`✅ Stats initialized for ${slug}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to initialize stats for ${slug}:`, message);
    return false;
  }
}

export async function resetStats(
  slug: string,
  env: Env
): Promise<boolean> {
  const key = getStatsKey(slug);

  try {
    const newStats: StoreStats = {
      salesCount: 0,
      orderCount: 0,
      revenue: 0,
      version: 1,
    };

    await env.BUFFER_KV.put(key, JSON.stringify(newStats));
    console.log(`🔄 Stats reset for ${slug}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to reset stats for ${slug}:`, message);
    return false;
  }
}

export async function hasStats(slug: string, env: Env): Promise<boolean> {
  const key = getStatsKey(slug);
  const value = await env.BUFFER_KV.get(key);
  return value !== null;
}

export async function getStatsForDashboard(
  slug: string,
  env: Env
): Promise<{
  success: boolean;
  stats?: StoreStatsSnapshot;
  error?: string;
}> {
  try {
    const stats = await getStats(slug, env);
    if (!stats) {
      return {
        success: false,
        error: 'Stats not found for this store',
      };
    }
    return {
      success: true,
      stats,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// 🔥 Auto Warm-up (إعادة بناء الإحصائيات من الطلبات في D1)
// ============================================================

export async function warmUpStats(
  slug: string,
  storeId: string,
  env: Env
): Promise<StoreStatsSnapshot | null> {
  console.log(`🔥 Warming up stats for ${slug} from D1...`);

  try {
    const result = await env.DB.prepare(
      `SELECT 
        COUNT(*) as orderCount,
        SUM(total_amount_int) as totalRevenue
       FROM orders 
       WHERE store_id = ?`
    ).bind(storeId).first<{ orderCount: number; totalRevenue: number }>();

    const orderCount = result?.orderCount ?? 0;
    const totalRevenue = result?.totalRevenue ?? 0;

    const newStats: StoreStats = {
      salesCount: orderCount,
      orderCount: orderCount,
      revenue: totalRevenue,
      version: 1,
    };

    const key = getStatsKey(slug);
    await env.BUFFER_KV.put(key, JSON.stringify(newStats));

    console.log(`✅ Stats warmed up for ${slug}: orders=${orderCount}, revenue=${totalRevenue}`);
    const { version, ...snapshot } = newStats;
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to warm up stats for ${slug}:`, message);
    return null;
  }
}