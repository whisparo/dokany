// src/lib/services/store-stats.ts

import { getDb, schema, type D1Transaction } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import type { Env } from '@/workers';
import { SystemError } from '@/lib/errors/types'; // 🚀 استيراد كلاس الأخطاء الموحد

export async function updateStoreStatsAfterOrder(
  env: Env & Record<string, unknown>, // ✅ حل مشكلة تيبات الـ env وتوافقها مع getDb
  storeId: string,
  orderTotal: string,
  tx?: D1Transaction
) {
  const db = getDb(env);
  const client = tx || db;

  try {
    const result = await client
      .update(schema.storeStats)
      .set({
        totalRevenue: sql`CAST(COALESCE(${schema.storeStats.totalRevenue}, '0') AS REAL) + CAST(${orderTotal} AS REAL)`,
        totalOrders: sql`${schema.storeStats.totalOrders} + 1`,
      })
      .where(eq(schema.storeStats.storeId, storeId))
      .returning({ id: schema.storeStats.id });

    // إذا لم يكن هناك سجل إحصائيات للمتجر بعد (أول طلب)، قم بإنشائه فوراً
    if (result.length === 0) {
      await client.insert(schema.storeStats).values({
        id: crypto.randomUUID(),
        storeId,
        totalRevenue: orderTotal,
        totalOrders: 1,
        totalCustomers: 0,
      });
    }
  } catch (error) {
    throw new SystemError({
      code: 'STA_501',
      userMessage: 'فشل النظام في تحديث إحصائيات المتجر الإجمالية، جاري إعادة المحاولة.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true, // حرج جداً لأن عدم تحديث الإيرادات يسبب تضارب مالي عند التاجر
      technicalMessage: `STORE_STATS_FAILURE: Failed to update stats for store ${storeId}.`,
      cause: error,
      metadata: { storeId, orderTotal, originalError: error instanceof Error ? error.message : String(error) }
    });
  }
}

export async function updateCustomerStats(
  env: Env & Record<string, unknown>, // ✅ حل مشكلة تيبات الـ env
  customerId: string,
  orderTotal: string,
  tx?: D1Transaction
) {
  const db = getDb(env);
  const client = tx || db;

  try {
    const result = await client
      .update(schema.customerStats)
      .set({
        totalSpent: sql`CAST(COALESCE(${schema.customerStats.totalSpent}, '0') AS REAL) + CAST(${orderTotal} AS REAL)`,
        ordersCount: sql`${schema.customerStats.ordersCount} + 1`,
        lastOrderAt: new Date(),
      })
      .where(eq(schema.customerStats.customerId, customerId))
      .returning({ id: schema.customerStats.id });

    if (result.length === 0) {
      await client.insert(schema.customerStats).values({
        id: crypto.randomUUID(),
        customerId,
        totalSpent: orderTotal,
        ordersCount: 1,
        lastOrderAt: new Date(),
      });
    }
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
      metadata: { customerId, orderTotal, originalError: error instanceof Error ? error.message : String(error) }
    });
  }
}

export async function updateProductStatsBatch(
  env: Env & Record<string, unknown>, // ✅ حل مشكلة تيبات الـ env
  items: { productId: string; quantity: number }[],
  tx?: D1Transaction
) {
  const db = getDb(env);
  const client = tx || db;
  if (items.length === 0) return;

  try {
    for (const item of items) {
      const result = await client
        .update(schema.productStats)
        .set({
          salesCount: sql`${schema.productStats.salesCount} + ${item.quantity}`,
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
    }
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
      metadata: { items, originalError: error instanceof Error ? error.message : String(error) }
    });
  }
}