// src/core/cron/consolidator.ts

/**
 * الملف المسؤول عن مزامنة (دمج) البيانات بين الـ KV السريع والـ D1 البارد.
 *
 * الوظائف:
 * - تحديث إحصائيات المتجر (المبيعات، الإيرادات) في D1 بناءً على KV.
 * - تحديث أسعار المنتجات في D1 بناءً على KV (في حال تغيرت).
 * - (اختياري) تحديث المخزون في D1، ولكن معمارياً المخزون مصدره الأساسي هو KV،
 *   لذلك هذا الملف لا يفرض تحديث المخزون، بل يسجل فقط حالة عدم التطابق.
 *
 * هذا الملف يُشغل عن طريق الـ Cron Job (كل ساعة مثلاً) أو يدوياً من لوحة التحكم.
 */

import type { Env } from '@/lib/env';
import { getStats } from '@/core/live-state/stats';
import { getMultiplePrices } from '@/core/live-state/price';
import { getStatus } from '@/core/live-state/status';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

/**
 * هيكل النتيجة بعد عملية الدمج
 */
export interface ConsolidationResult {
  /** عدد المتاجر التي تمت معالجتها */
  storesProcessed: number;
  /** عدد الإحصائيات التي تم تحديثها في D1 */
  statsUpdated: number;
  /** عدد الأسعار التي تم تحديثها في D1 */
  pricesUpdated: number;
  /** قائمة الأخطاء التي حدثت أثناء الدمج */
  errors: string[];
}

// ============================================================
// 🧠 دوال مساعدة داخلية
// ============================================================

/**
 * الحصول على جميع المتاجر النشطة من D1
 */
async function getAllActiveStores(
  env: Env
): Promise<Array<{ id: string; slug: string }>> {
  const result = await env.DB.prepare(
    `SELECT id, slug FROM stores WHERE status = 'active'`
  ).all<{ id: string; slug: string }>();

  return result.results || [];
}

/**
 * الحصول على جميع معرفات المنتجات لمتجر معين من D1
 */
async function getProductIdsForStore(
  storeId: string,
  env: Env
): Promise<string[]> {
  const result = await env.DB.prepare(
    `SELECT id FROM products WHERE store_id = ? AND deleted_at IS NULL`
  ).bind(storeId).all<{ id: string }>();

  return (result.results || []).map((row) => row.id);
}

// ============================================================
// 📤 دالة الدمج الرئيسية
// ============================================================

/**
 * دمج البيانات من KV إلى D1
 * - تحديث الإحصائيات (المبيعات، الإيرادات، عدد الطلبات)
 * - تحديث الأسعار
 * - (اختياري) التحقق من حالة المتجر
 *
 * هذه الدالة تُشغل من الـ Cron Job كل ساعة (أو حسب الحاجة).
 */
export async function consolidate(
  env: Env
): Promise<ConsolidationResult> {
  const result: ConsolidationResult = {
    storesProcessed: 0,
    statsUpdated: 0,
    pricesUpdated: 0,
    errors: [],
  };

  console.log('🔄 Starting consolidation cycle (KV → D1)...');

  try {
    // 1️⃣ الحصول على جميع المتاجر النشطة
    const stores = await getAllActiveStores(env);
    console.log(`📦 Found ${stores.length} active stores.`);

    for (const store of stores) {
      const { id: storeId, slug } = store;
      console.log(`🔍 Processing store: ${slug} (${storeId})`);

      try {
        // 2️⃣ تحديث الإحصائيات
        await consolidateStats(storeId, slug, env, result);

        // 3️⃣ تحديث الأسعار
        await consolidatePrices(storeId, slug, env, result);

        // 4️⃣ تحديث حالة المتجر (إذا كانت مختلفة)
        await consolidateStatus(slug, env, result);

        result.storesProcessed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const errorMsg = `Store ${slug} (${storeId}) failed: ${message}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    console.log(`✅ Consolidation completed. Processed ${result.storesProcessed} stores.`);
    console.log(`📊 Stats updated: ${result.statsUpdated}, Prices updated: ${result.pricesUpdated}`);
    if (result.errors.length > 0) {
      console.warn(`⚠️ ${result.errors.length} errors occurred.`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Consolidation cycle failed: ${message}`);
    result.errors.push(`Cycle failed: ${message}`);
    return result;
  }
}

// ============================================================
// 🧠 دوال الدمج الفرعية
// ============================================================

/**
 * دمج الإحصائيات من KV إلى D1
 */
async function consolidateStats(
  storeId: string,
  slug: string,
  env: Env,
  result: ConsolidationResult
): Promise<void> {
  // 1️⃣ قراءة الإحصائيات من KV
  const kvStats = await getStats(slug, env);
  if (!kvStats) {
    console.log(`ℹ️ No stats found in KV for ${slug}, skipping.`);
    return;
  }

  // 2️⃣ قراءة الإحصائيات من D1
  const dbStats = await env.DB.prepare(
    `SELECT sales_count, total_revenue FROM store_stats WHERE store_id = ?`
  ).bind(storeId).first<{ sales_count: number; total_revenue: number }>();

  // 3️⃣ مقارنة القيم وتحديث D1 إذا كانت مختلفة
  let needsUpdate = false;
  const updates: string[] = [];

  if (!dbStats) {
    // لا توجد إحصائيات في D1 → إنشاء
    needsUpdate = true;
    updates.push('missing in D1');
  } else {
    if (dbStats.sales_count !== kvStats.salesCount) {
      needsUpdate = true;
      updates.push(`sales ${dbStats.sales_count} → ${kvStats.salesCount}`);
    }
    if (dbStats.total_revenue !== kvStats.revenue) {
      needsUpdate = true;
      updates.push(`revenue ${dbStats.total_revenue} → ${kvStats.revenue}`);
    }
  }

  if (needsUpdate) {
    await env.DB.prepare(
      `INSERT INTO store_stats (store_id, sales_count, total_revenue, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(store_id) DO UPDATE SET
         sales_count = excluded.sales_count,
         total_revenue = excluded.total_revenue,
         updated_at = excluded.updated_at`
    ).bind(
      storeId,
      kvStats.salesCount,
      kvStats.revenue,
      Date.now()
    ).run();

    result.statsUpdated++;
    console.log(`📊 Stats updated for ${slug}: ${updates.join(', ')}`);
  } else {
    console.log(`ℹ️ Stats for ${slug} are already up-to-date.`);
  }
}

/**
 * دمج الأسعار من KV إلى D1
 */
async function consolidatePrices(
  storeId: string,
  slug: string,
  env: Env,
  result: ConsolidationResult
): Promise<void> {
  // 1️⃣ الحصول على جميع معرفات المنتجات للمتجر
  const productIds = await getProductIdsForStore(storeId, env);
  if (productIds.length === 0) {
    console.log(`ℹ️ No products found for store ${slug}, skipping price consolidation.`);
    return;
  }

  // 2️⃣ قراءة الأسعار من KV (دفعة واحدة)
  const kvPrices = await getMultiplePrices(slug, productIds, env);
  if (kvPrices.size === 0) {
    console.log(`ℹ️ No prices found in KV for ${slug}, skipping.`);
    return;
  }

  // 3️⃣ قراءة الأسعار من D1 (لمقارنتها)
  const dbPrices = await env.DB.prepare(
    `SELECT id, price FROM products WHERE store_id = ? AND deleted_at IS NULL`
  ).bind(storeId).all<{ id: string; price: number }>();

  const dbPriceMap = new Map<string, number>();
  for (const row of dbPrices.results || []) {
    dbPriceMap.set(row.id, row.price);
  }

  // 4️⃣ تحديث الأسعار في D1 إذا كانت مختلفة
  let updatedCount = 0;
  for (const [productId, kvPrice] of kvPrices) {
    const dbPrice = dbPriceMap.get(productId);
    if (dbPrice === undefined || dbPrice !== kvPrice) {
      await env.DB.prepare(
        `UPDATE products SET price = ?, updated_at = ? WHERE id = ?`
      ).bind(kvPrice, Date.now(), productId).run();
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    result.pricesUpdated += updatedCount;
    console.log(`💰 Prices updated for ${updatedCount} products in store ${slug}.`);
  } else {
    console.log(`ℹ️ All prices for ${slug} are already up-to-date.`);
  }
}

/**
 * دمج حالة المتجر من KV إلى D1 (إذا كانت مختلفة)
 */
async function consolidateStatus(
  slug: string,
  env: Env,
  result: ConsolidationResult
): Promise<void> {
  const kvStatus = await getStatus(slug, env);
  if (!kvStatus) {
    console.log(`ℹ️ No status found in KV for ${slug}, skipping.`);
    return;
  }

  // قراءة الحالة من D1
  const dbStatus = await env.DB.prepare(
    `SELECT status FROM store_settings WHERE slug = ?`
  ).bind(slug).first<{ status: string }>();

  if (!dbStatus || dbStatus.status !== kvStatus) {
    await env.DB.prepare(
      `UPDATE store_settings SET status = ?, updated_at = ? WHERE slug = ?`
    ).bind(kvStatus, Date.now(), slug).run();
    console.log(`🔄 Status updated for ${slug}: ${dbStatus?.status || 'N/A'} → ${kvStatus}`);
  } else {
    console.log(`ℹ️ Status for ${slug} is already up-to-date.`);
  }
}