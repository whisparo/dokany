// src/lib/services/store-stats.ts

import { getDb, schema, type D1Transaction } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { Redis } from '@upstash/redis';
import type { Env } from '@/lib/env';
import { SystemError } from '@/lib/errors';

/**
 * دالة مساعدة لحذف مفاتيح الكاش من Redis بعد أي عملية تحديث
 */
async function invalidateStatsCache(env: Env, keys: string[]) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN || keys.length === 0) {
    return;
  }
  try {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    await redis.del(...keys);
  } catch (error) {
    console.warn('⚠️ Failed to invalidate stats cache in Redis:', error);
  }
}

/**
 * تحديث إحصائيات المتجر الإجمالية بعد إنشاء أو تعديل طلب
 * @param orderTotalAmount المبلغ بالهللات/السنتات (Integer Cents)
 */
export async function updateStoreStatsAfterOrder(
  env: Env,
  storeId: string,
  orderTotalAmount: number,
  tx?: D1Transaction
) {
  const db = getDb(env);
  const client = tx || db;

  try {
    const result = await client
      .update(schema.storeStats)
      .set({
        totalRevenue: sql`COALESCE(${schema.storeStats.totalRevenue}, 0) + ${orderTotalAmount}`,
        totalOrders: sql`COALESCE(${schema.storeStats.totalOrders}, 0) + 1`,
      })
      .where(eq(schema.storeStats.storeId, storeId))
      .returning({ id: schema.storeStats.id });

    if (result.length === 0) {
      await client.insert(schema.storeStats).values({
        id: crypto.randomUUID(),
        storeId,
        totalRevenue: orderTotalAmount,
        totalOrders: 1,
        totalCustomers: 0,
      });
    }

    // ⚡ إبطال كاش إحصائيات المتجر المربوط في Redis
    await invalidateStatsCache(env, [`cache:store-stats:${storeId}`]);
  } catch (error) {
    throw new SystemError({
      code: 'STA_501',
      userMessage: 'فشل النظام في تحديث إحصائيات المتجر الإجمالية، جاري إعادة المحاولة.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true,
      technicalMessage: `STORE_STATS_FAILURE: Failed to update stats for store ${storeId}.`,
      cause: error,
      metadata: { storeId, orderTotalAmount, originalError: error instanceof Error ? error.message : String(error) },
    });
  }
}

/**
 * تحديث سجلات الشراء الخاصة بالعميل
 * @param orderTotalAmount المبلغ بالهللات/السنتات (Integer Cents)
 */
export async function updateCustomerStats(
  env: Env,
  customerId: string,
  orderTotalAmount: number,
  tx?: D1Transaction
) {
  const db = getDb(env);
  const client = tx || db;
  const now = new Date();

  try {
    const result = await client
      .update(schema.customerStats)
      .set({
        totalSpent: sql`COALESCE(${schema.customerStats.totalSpent}, 0) + ${orderTotalAmount}`,
        ordersCount: sql`COALESCE(${schema.customerStats.ordersCount}, 0) + 1`,
        lastOrderAt: now,
      })
      .where(eq(schema.customerStats.customerId, customerId))
      .returning({ id: schema.customerStats.id });

    if (result.length === 0) {
      await client.insert(schema.customerStats).values({
        id: crypto.randomUUID(),
        customerId,
        totalSpent: orderTotalAmount,
        ordersCount: 1,
        lastOrderAt: now,
      });
    }

    // ⚡ إبطال كاش إحصائيات العميل
    await invalidateStatsCache(env, [`cache:customer-stats:${customerId}`]);
  } catch (error) {
    throw new SystemError({
      code: 'STA_502',
      userMessage: 'فشل تحديث ملف سجلات شراء العميل.',
      category: 'database',
      severity: 'warning',
      retryable: true,
      shouldAlert: true,
      technicalMessage: `CUSTOMER_STATS_FAILURE: Failed to update stats for customer ${customerId}.`,
      cause: error,
      metadata: { customerId, orderTotalAmount, originalError: error instanceof Error ? error.message : String(error) },
    });
  }
}

/**
 * تحديث كميات المبيعات الإجمالية للمنتجات المشتراة في دُفعة واحدة (Batch)
 */
export async function updateProductStatsBatch(
  env: Env,
  items: { productId: string; quantity: number }[],
  tx?: D1Transaction
) {
  const db = getDb(env);
  const client = tx || db;
  if (items.length === 0) return;

  try {
    const invalidateKeys: string[] = [];

    for (const item of items) {
      const result = await client
        .update(schema.productStats)
        .set({
          salesCount: sql`COALESCE(${schema.productStats.salesCount}, 0) + ${item.quantity}`,
        })
        .where(eq(schema.productStats.productId, item.productId))
        .returning({ id: schema.productStats.id });

      if (result.length === 0) {
        await client.insert(schema.productStats).values({
          id: crypto.randomUUID(),
          productId: item.productId,
          viewsCount: 0,
          salesCount: item.quantity,
          reviewsCount: 0,
          rating: 0,
        });
      }

      invalidateKeys.push(`cache:product-stats:${item.productId}`);
    }

    // ⚡ إبطال الكاش لجميع المنتجات المحدثة
    await invalidateStatsCache(env, invalidateKeys);
  } catch (error) {
    throw new SystemError({
      code: 'STA_503',
      userMessage: 'فشل تحديث عدادات مبيعات المنتجات المشتراة.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true,
      technicalMessage: `PRODUCT_STATS_FAILURE: Batch update failed.`,
      cause: error,
      metadata: { items, originalError: error instanceof Error ? error.message : String(error) },
    });
  }
}