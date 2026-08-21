// src/lib/cache/edge-stock-cache.ts

import type { KVNamespace } from '@cloudflare/workers-types';
import type { Env } from '@/lib/env';

// ============================================================
// 📦 Server-Side Stock Cache (Cloudflare KV & D1 Engine)
// ============================================================

/**
 * 💡 دالة مساعدة لاستخراج الـ KV Namespace من البيئة بأمان ودون استخدام any
 */
function getKvInstance(env: Env): KVNamespace | null {
  const kv = env.CUSTOM_DOMAINS_KV;
  if (kv) return kv;

  if ('ORDERS_KV' in env && env.ORDERS_KV) {
    return env.ORDERS_KV as KVNamespace;
  }

  return null;
}

/**
 * حساب أو جلب المخزون اللحظي مع طرح الطلبات المعلقة في الـ KV
 */
export async function getOrWarmupStock(
  env: Env,
  storeId: string,
  productId: string
): Promise<number> {
  const kv = getKvInstance(env);
  const stockKey = `store:${storeId}:product:${productId}:stock`;

  if (!kv) {
    const dbResult = await env.DB.prepare(
      'SELECT stock FROM products WHERE store_id = ? AND id = ?'
    )
      .bind(storeId, productId)
      .first<{ stock: number }>();

    return dbResult?.stock ?? 0;
  }

  // 1. القراءة من كاش الـ KV السريع
  const cachedStock = await kv.get(stockKey);
  if (cachedStock !== null) {
    return parseInt(cachedStock, 10);
  }

  // 2. Base Stock من قاعدة البيانات D1 عند الـ Cache Miss
  const dbResult = await env.DB.prepare(
    'SELECT stock FROM products WHERE store_id = ? AND id = ?'
  )
    .bind(storeId, productId)
    .first<{ stock: number }>();

  const baseStock = dbResult?.stock ?? 0;

  // 3. خصم الكميات المعلقة في الـ KV التي لم تُرحل إلى D1 بعد
  let pendingDeducted = 0;
  let cursor: string | undefined;

  type ListResult = Awaited<ReturnType<KVNamespace['list']>>;

  do {
    const listRes: ListResult = await kv.list({
      prefix: `pending_order:${storeId}:`,
      cursor,
    });

    // 🎯 جلب كل الطلبات المعلقة بالتوازي دفعة واحدة
    const orders = await Promise.all(
      listRes.keys.map((key) =>
        kv.get<{ items?: Array<{ productId: string; qty: number }> }>(key.name, 'json')
      )
    );

    for (const order of orders) {
      if (order?.items) {
        const item = order.items.find((i) => i.productId === productId);
        if (item) {
          pendingDeducted += item.qty;
        }
      }
    }

    cursor = listRes.list_complete ? undefined : listRes.cursor;
  } while (cursor);

  // 4. تعيين القيمة الكلية وتخزينها لـ 24 ساعة
  const realStock = Math.max(0, baseStock - pendingDeducted);
  await kv.put(stockKey, realStock.toString(), {
    expirationTtl: 86400,
  });

  return realStock;
}

/**
 * خصم المخزون مؤقتاً في الـ KV
 */
export async function deductStockCache(
  env: Env,
  storeId: string,
  productId: string,
  quantity: number
): Promise<void> {
  const kv = getKvInstance(env);
  if (!kv) return;

  const stockKey = `store:${storeId}:product:${productId}:stock`;
  const current = await getOrWarmupStock(env, storeId, productId);
  const updated = Math.max(0, current - quantity);

  await kv.put(stockKey, updated.toString(), {
    expirationTtl: 86400,
  });
}

/**
 * استرجاع المخزون للـ KV عند فشل العملية (Rollback)
 */
export async function rollbackStockCache(
  env: Env,
  storeId: string,
  productId: string,
  quantity: number
): Promise<void> {
  const kv = getKvInstance(env);
  if (!kv) return;

  const stockKey = `store:${storeId}:product:${productId}:stock`;
  
  // 🎯 نستخدم getOrWarmupStock لضمان جلب القاعدة الصحيحة لو الكاش طار
  const current = await getOrWarmupStock(env, storeId, productId);
  const updated = current + quantity;

  await kv.put(stockKey, updated.toString(), {
    expirationTtl: 86400,
  });
}