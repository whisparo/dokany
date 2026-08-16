// src/lib/services/inventory-service.ts

import { eq, sql, and, gte, isNull, inArray } from 'drizzle-orm';
import { Redis } from '@upstash/redis';
import { schema, type D1Transaction } from '@/lib/db';
import { getDb } from '@/lib/db/db';
import { SystemError } from '@/lib/errors/types';
import { AlertService } from '@/lib/services/alert-service';
import type { Env } from '@/lib/env';

// ============================================================
// 📦 Redis Client (Singleton per Isolate)
// ============================================================
let redisClient: Redis | null = null;

function getRedisClient(env: Env): Redis | null {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

// ============================================================
// 📜 Lua Scripts (Atomic Operations)
// ============================================================

const LUA_DECREMENT_SCRIPT = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local current = redis.call('GET', key)

if current == false then
    return -2
end

local stock = tonumber(current)
if stock >= amount then
    redis.call('DECRBY', key, amount)
    return stock - amount
else
    return -1
end
`;

const LUA_INCREMENT_SCRIPT = `
local key = KEYS[1]
local amount = tonumber(ARGV[1])
return redis.call('INCRBY', key, amount)
`;

const LUA_VERSIONED_SYNC_SCRIPT = `
local stockKey = KEYS[1]
local versionKey = KEYS[2]
local newStock = tonumber(ARGV[1])
local newVersion = tonumber(ARGV[2])

local currentVersion = tonumber(redis.call('GET', versionKey) or '0')

if newVersion > currentVersion then
    redis.call('SET', stockKey, newStock)
    redis.call('SET', versionKey, newVersion)
    return 1
else
    return 0
end
`;

// ============================================================
// 📋 Types
// ============================================================

export type StockUpdateItem = {
  productId: string;
  variantSku?: string;
  quantity: number;
};

export type ReserveStockResult = {
  success: boolean;
  newStock?: number;
  usedFallback?: boolean;
  reason?: 'out_of_stock' | 'server_busy' | 'product_not_found' | 'invalid_request';
};

// ============================================================
// 🔧 الدوال الأساسية (Public API)
// ============================================================

export async function updateStock(items: StockUpdateItem[], tx: D1Transaction): Promise<void> {
  if (!items || items.length === 0) return;

  try {
    for (const item of items) {
      if (item.quantity === 0) continue;

      const isDeduction = item.quantity > 0;

      const productWhere = isDeduction
        ? and(
            eq(schema.products.id, item.productId),
            isNull(schema.products.deletedAt),
            gte(schema.products.stock, item.quantity)
          )
        : and(
            eq(schema.products.id, item.productId),
            isNull(schema.products.deletedAt)
          );

      const result = await tx
        .update(schema.products)
        .set({
          stock: sql`${schema.products.stock} - ${item.quantity}`,
          version: sql`${schema.products.version} + 1`,
          updatedAt: new Date(),
        })
        .where(productWhere)
        .returning({ id: schema.products.id, stock: schema.products.stock });

      if (!result || result.length === 0) {
        throw new SystemError({
          code: 'INV_400',
          userMessage: 'الكمية المطلوبة للمنتج غير متوفرة حالياً في المخزن.',
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          technicalMessage: `Product ${item.productId} does not exist or has insufficient stock.`,
          metadata: {
            productId: item.productId,
            attemptedQuantity: item.quantity,
          },
        });
      }
    }
  } catch (error) {
    if (error instanceof SystemError) throw error;

    throw new SystemError({
      code: 'INV_500',
      userMessage: 'حدث خطأ غير متوقع أثناء تحديث المخزون، يرجى المحاولة لاحقاً.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true,
      technicalMessage:
        error instanceof Error ? error.message : 'Unknown database error during stock update',
      cause: error,
      metadata: { originalError: String(error) },
    });
  }
}

export async function reserveStockAtomic(
  productId: string,
  quantity: number,
  storeId: string,
  env: Env
): Promise<ReserveStockResult> {
  if (quantity <= 0) {
    return { success: false, reason: 'invalid_request' };
  }

  const redis = getRedisClient(env);
  const stockKey = `stock:${productId}`;

  if (!redis) {
    console.warn(`[Inventory] Redis not configured, using D1 directly for ${productId}`);
    return await fallbackToD1(productId, quantity, storeId, env);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const redisPromise = redis.eval(
      LUA_DECREMENT_SCRIPT,
      [stockKey],
      [quantity]
    ) as Promise<number>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('RedisTimeout')), 500);
    });

    const evalResult = await Promise.race([redisPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);

    const resNum = typeof evalResult === 'number' ? evalResult : Number(evalResult);

    if (!isNaN(resNum) && resNum >= 0) {
      console.log(`[Inventory] ✅ Redis reserved stock for ${productId}, new stock: ${resNum}`);

      if (resNum <= 5) {
        AlertService.notifyLowStock(env, { storeId, productId, currentStock: resNum });
      }

      return { success: true, newStock: resNum, usedFallback: false };
    }

    if (resNum === -1) {
      console.warn(`[Inventory] ⚠️ Product ${productId} out of stock in Redis`);
      return { success: false, reason: 'out_of_stock' };
    }

    console.warn(`[Inventory] ⚠️ Redis key missing for ${productId}, falling back to D1`);
    return await fallbackToD1(productId, quantity, storeId, env);
  } catch (error) {
    if (timer) clearTimeout(timer);
    const reasonMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Inventory] ❌ Redis failed for ${productId}, falling back to D1:`, error);

    AlertService.notifyFallbackActivated(env, { storeId, productId, reason: `Redis error: ${reasonMsg}` });

    return await fallbackToD1(productId, quantity, storeId, env);
  }
}

async function fallbackToD1(
  productId: string,
  quantity: number,
  storeId: string,
  env: Env
): Promise<ReserveStockResult> {
  const db = getDb(env);
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const dbPromise = db
      .update(schema.products)
      .set({
        stock: sql`${schema.products.stock} - ${quantity}`,
        version: sql`${schema.products.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.products.id, productId),
          isNull(schema.products.deletedAt),
          gte(schema.products.stock, quantity)
        )
      )
      .returning({ stock: schema.products.stock });

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('D1Timeout')), 200);
    });

    const result = (await Promise.race([dbPromise, timeoutPromise])) as Array<{ stock: number }>;
    if (timer) clearTimeout(timer);

    if (result && result.length > 0 && typeof result[0].stock === 'number') {
      const newStock = result[0].stock;
      console.log(`[Inventory] ✅ D1 fallback succeeded for ${productId}, new stock: ${newStock}`);

      AlertService.notifyFallbackActivated(env, {
        storeId,
        productId,
        reason: 'Redis unavailable, D1 fallback used',
      });

      if (newStock <= 5) {
        AlertService.notifyLowStock(env, { storeId, productId, currentStock: newStock });
      }

      return { success: true, newStock, usedFallback: true };
    }

    console.warn(`[Inventory] ⚠️ D1 fallback: product ${productId} out of stock or not found`);
    return { success: false, reason: 'out_of_stock' };
  } catch (error) {
    if (timer) clearTimeout(timer);

    if (error instanceof Error && error.message === 'D1Timeout') {
      console.warn(`[Inventory] ⏰ D1 fallback timeout (200ms) for ${productId}`);
    } else {
      console.error(`[Inventory] ❌ D1 fallback error for ${productId}:`, error);
    }

    return { success: false, reason: 'server_busy' };
  }
}

export async function compensateStock(
  productId: string,
  quantity: number,
  usedFallback: boolean,
  storeId: string,
  env: Env
): Promise<void> {
  if (quantity <= 0) return;

  try {
    if (usedFallback) {
      const db = getDb(env);
      await db
        .update(schema.products)
        .set({
          stock: sql`${schema.products.stock} + ${quantity}`,
          version: sql`${schema.products.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.products.id, productId), isNull(schema.products.deletedAt)))
        .execute();

      console.log(`[Inventory] ✅ Compensation: added ${quantity} to D1 stock for ${productId}`);
    } else {
      const redis = getRedisClient(env);
      if (redis) {
        const stockKey = `stock:${productId}`;
        const newStock = (await redis.eval(LUA_INCREMENT_SCRIPT, [stockKey], [quantity])) as number;
        console.log(`[Inventory] ✅ Compensation: incremented Redis stock for ${productId}, new stock: ${newStock}`);
      }

      const db = getDb(env);
      await db
        .update(schema.products)
        .set({
          stock: sql`${schema.products.stock} + ${quantity}`,
          version: sql`${schema.products.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.products.id, productId), isNull(schema.products.deletedAt)))
        .execute();
    }

    if (quantity >= 5) {
      AlertService.notifyCompensation(env, { storeId, productId, quantity, usedFallback });
    }
  } catch (error) {
    console.error(`[Inventory] 🚨 CRITICAL: Compensation failed for product ${productId}`, error);

    AlertService.notifyCriticalFailure(env, { storeId, productId, quantity, usedFallback, error });

    throw new SystemError({
      code: 'INV_501',
      userMessage: 'حدث خطأ في تحديث المخزون، يرجى التواصل مع الدعم.',
      category: 'database',
      severity: 'critical',
      retryable: false,
      shouldAlert: true,
      technicalMessage: `Compensation failed for product ${productId}`,
      cause: error,
      metadata: { productId, storeId, usedFallback },
    });
  }
}

export async function syncStockFromD1ToRedis(
  productIds?: string[],
  env?: Env
): Promise<void> {
  if (!env) {
    console.error('[Inventory] syncStockFromD1ToRedis: env is required');
    return;
  }

  const redis = getRedisClient(env);
  if (!redis) {
    console.warn('[Inventory] syncStockFromD1ToRedis: Redis not configured, skipping');
    return;
  }

  const db = getDb(env);
  let products: Array<{ id: string; stock: number; version: number }>;

  if (productIds && productIds.length > 0) {
    products = await db
      .select({
        id: schema.products.id,
        stock: schema.products.stock,
        version: schema.products.version,
      })
      .from(schema.products)
      .where(and(inArray(schema.products.id, productIds), isNull(schema.products.deletedAt)))
      .all();
  } else {
    products = await db
      .select({
        id: schema.products.id,
        stock: schema.products.stock,
        version: schema.products.version,
      })
      .from(schema.products)
      .where(isNull(schema.products.deletedAt))
      .all();
  }

  if (products.length === 0) {
    console.log('[Inventory] syncStockFromD1ToRedis: no products to sync');
    return;
  }

  let synced = 0;
  let skipped = 0;

  const BATCH_SIZE = 100;
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const pipeline = redis.pipeline();

    for (const p of batch) {
      const stockKey = `stock:${p.id}`;
      const versionKey = `version:${p.id}`;

      pipeline.eval(LUA_VERSIONED_SYNC_SCRIPT, [stockKey, versionKey], [p.stock, p.version]);
    }

    try {
      const results = await pipeline.exec();
      for (const res of results) {
        if (res === 1) {
          synced++;
        } else {
          skipped++;
        }
      }
    } catch (error) {
      console.error('[Inventory] ❌ Pipeline execution failed:', error);
    }
  }

  console.log(`[Inventory] ✅ Auto Sync completed: ${synced} synced, ${skipped} skipped (already up-to-date)`);
}