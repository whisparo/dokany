// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import type { Env } from '@/lib/env';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency';
import { eq, and, lte } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';
import { Redis } from '@upstash/redis';

const DEFAULT_LOCK_TTL_MS = 30 * 1000; // 30 ثانية
const HEARTBEAT_INTERVAL_MS = 10 * 1000; // تجديد القفل كل 10 ثواني

// ============================================================
// 📜 Lua Scripts (Atomic Redis Operations)
// ============================================================

/**
 * Atomic Compare-and-Delete
 * بيحذف القفل فقط لو الـ token يطابق المالك الحالي
 * بيمنع Lock Theft لو الـ TTL خلص قبل الحذف
 */
const LUA_RELEASE_LOCK = `
local key = KEYS[1]
local token = ARGV[1]
local current = redis.call('GET', key)
if current == token then
    return redis.call('DEL', key)
else
    return 0
end
`;

/**
 * Atomic Renew (TTL Extension)
 * بيحدث TTL فقط لو الـ token يطابق المالك الحالي
 * يُستخدم في الـ Heartbeat للعمليات الطويلة
 */
const LUA_RENEW_LOCK = `
local key = KEYS[1]
local token = ARGV[1]
local ttl = tonumber(ARGV[2])
local current = redis.call('GET', key)
if current == token then
    return redis.call('EXPIRE', key, ttl)
else
    return 0
end
`;

// ============================================================
// 🔌 Redis Client (Singleton per Isolate)
// ============================================================
let redisClient: Redis | null = null;

function getRedisClient(env: {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}): Redis | null {
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
// 🔒 Idempotency Engine
// ============================================================

interface IdempotencyOptions {
  /** مدة القفل بالمللي ثانية (افتراضي: 30 ثانية) */
  lockTTLMs?: number;
  /** تفعيل Heartbeat للعمليات الطويلة (افتراضي: true) */
  enableHeartbeat?: boolean;
}

export const idempotency = {
  async execute<T>(
    env: Env,
    key: string,
    fn: () => Promise<T>,
    options: IdempotencyOptions = {}
  ): Promise<T> {
    const {
      lockTTLMs = DEFAULT_LOCK_TTL_MS,
      enableHeartbeat = true,
    } = options;

    const db = getDb(env);
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + lockTTLMs);
    const lockToken = crypto.randomUUID();

    // ═══════════════════════════════════════════════════════════
    // 1️⃣ محاولة القفل عبر Redis
    // ═══════════════════════════════════════════════════════════
    let redisLockAcquired = false;
    const redis = getRedisClient(env);

    if (redis) {
      try {
        const result = await redis.set(`lock:idempotency:${key}`, lockToken, {
          nx: true,
          ex: Math.ceil(lockTTLMs / 1000),
        });

        redisLockAcquired = !!result;
        if (!redisLockAcquired) {
          throw new SystemError({
            code: 'IDEM_409',
            userMessage: 'طلبك قيد المعالجة حالياً، يرجى الانتظار.',
            category: 'business',
            severity: 'info',
            retryable: true,
            shouldAlert: false,
            technicalMessage: `Redis lock already held for key: ${key}`,
          });
        }
      } catch (redisError) {
        if (redisError instanceof SystemError) throw redisError;
        console.warn('⚠️ Redis lock failed, falling back to D1 only:', redisError);
        redisLockAcquired = false;
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 🫀 Heartbeat Setup (للعمليات الطويلة)
    // ═══════════════════════════════════════════════════════════
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let isExecuting = true; // flag لإيقاف الـ heartbeat

    if (redisLockAcquired && redis && enableHeartbeat) {
      heartbeatInterval = setInterval(async () => {
        if (!isExecuting) {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          return;
        }

        try {
          // ✅ Atomic renew باستخدام Lua Script
          await redis.eval(
            LUA_RENEW_LOCK,
            [`lock:idempotency:${key}`],
            [lockToken, Math.ceil(lockTTLMs / 1000)]
          );
        } catch (error) {
          console.warn(`⚠️ Heartbeat failed for key ${key}:`, error);
        }
      }, HEARTBEAT_INTERVAL_MS);
    }

    try {
      // ═══════════════════════════════════════════════════════════
      // 2️⃣ محاولة الإدراج الذرية في D1
      // ═══════════════════════════════════════════════════════════
      const insertResult = await db
        .insert(idempotencyTable)
        .values({
          key,
          status: 'pending',
          createdAt: now,
          expiresAt: lockExpiry,
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyTable.key });

      // ═══════════════════════════════════════════════════════════
      // 3️⃣ التعامل مع حالة وجود السجل مسبقاً (Conflict)
      // ═══════════════════════════════════════════════════════════
      if (insertResult.length === 0) {
        const [record] = await db
          .select()
          .from(idempotencyTable)
          .where(eq(idempotencyTable.key, key))
          .limit(1);

        if (!record) {
          throw new SystemError({
            code: 'IDEM_500',
            userMessage: 'حدث خطأ أثناء التحقق من تكرار الطلب، يرجى المحاولة لاحقاً.',
            category: 'database',
            severity: 'critical',
            retryable: true,
            shouldAlert: true,
            technicalMessage: `Idempotency record not found post-conflict for key: ${key}`,
          });
        }

        // 🟢 3.1 النتيجة مكتملة ومحفوظة (Cached Return)
        if (record.status === 'completed') {
          if (record.result) {
            try {
              const parsed = JSON.parse(record.result) as T;
              // ✅ تأكيد نجاح الـ parse قبل الإرجاع
              if (parsed !== null && parsed !== undefined) {
                return parsed;
              }
            } catch {
              // ⚠️ JSON فاسد - نعيد التنفيذ بدلاً من رمي error
              console.warn(`⚠️ Invalid JSON in idempotency result for key ${key}, will re-execute`);
              // نتابع للـ takeover (زي الـ failed)
            }
          } else {
            // نتيجة فاضية (null/undefined صحيحة)
            throw new SystemError({
              code: 'IDEM_409',
              userMessage: 'تم تنفيذ هذا الطلب بنجاح مسبقاً.',
              category: 'business',
              severity: 'info',
              retryable: false,
              shouldAlert: false,
              technicalMessage: `Completed result exists for key: ${key}`,
            });
          }
        }

        // 🟠 3.2 القفل منتهي الصلاحية أو العملية سقطت (Expired / Failed Takeover)
        const recordExpiry = record.expiresAt ? new Date(record.expiresAt) : new Date(0);
        const isExpired = record.status === 'pending' && recordExpiry.getTime() <= now.getTime();
        const isFailed = record.status === 'failed';

        if (isExpired || isFailed) {
          const updateResult = await db
            .update(idempotencyTable)
            .set({
              status: 'pending',
              createdAt: now,
              expiresAt: lockExpiry,
              result: null,
            })
            .where(
              and(
                eq(idempotencyTable.key, key),
                isExpired
                  ? lte(idempotencyTable.expiresAt, now)
                  : eq(idempotencyTable.status, 'failed')
              )
            )
            .returning({ key: idempotencyTable.key });

          // 🛑 فشل التنافس على استعادة القفل
          if (updateResult.length === 0) {
            throw new SystemError({
              code: 'IDEM_409',
              userMessage: 'طلبك قيد المعالجة حالياً من قِبل سيرفر آخر، يرجى الانتظار.',
              category: 'business',
              severity: 'info',
              retryable: true,
              shouldAlert: false,
              technicalMessage: `Failed atomic lock takeover for key: ${key}.`,
            });
          }
        } else {
          // 🔴 3.3 الطلب ما زال نشطاً (Active Pending)
          throw new SystemError({
            code: 'IDEM_409',
            userMessage: 'طلبك قيد المعالجة حالياً، يرجى عدم إعادة التحديث.',
            category: 'business',
            severity: 'info',
            retryable: true,
            shouldAlert: false,
            technicalMessage: `Operation with key ${key} is currently active and pending.`,
          });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 4️⃣ تنفيذ المنطق التجاري (Business Logic Execution)
      // ═══════════════════════════════════════════════════════════
      const result = await fn();

      // ═══════════════════════════════════════════════════════════
      // 5️⃣ حفظ النتيجة وتعليم العملية كـ Completed
      // ═══════════════════════════════════════════════════════════
      await db
        .update(idempotencyTable)
        .set({
          status: 'completed',
          result: result !== undefined ? JSON.stringify(result) : null,
          completedAt: new Date(),
        })
        .where(eq(idempotencyTable.key, key));

      // 🔓 تحرير آمن لقفل Redis (Atomic Release via Lua Script)
      if (redisLockAcquired && redis) {
        await releaseRedisLockAtomic(redis, key, lockToken);
      }

      return result;

    } catch (error) {
      // 🛑 حماية: عدم تعديل حالة D1 إذا كان الخطأ هو رفض التكرار (IDEM_409)
      const isConcurrencyConflict =
        error instanceof SystemError && error.code === 'IDEM_409';

      if (!isConcurrencyConflict) {
        try {
          await db
            .update(idempotencyTable)
            .set({
              status: 'failed',
              result: JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown execution error',
              }),
            })
            .where(eq(idempotencyTable.key, key));
        } catch (dbError) {
          console.error('⚠️ Failed to register idempotency failure status:', dbError);
        }
      }

      // 🔓 تحرير قفل Redis عند الفشل (Atomic Release)
      if (redisLockAcquired && redis) {
        await releaseRedisLockAtomic(redis, key, lockToken);
      }

      if (error instanceof SystemError && error.code.startsWith('IDEM_')) {
        throw error;
      }

      throw new SystemError({
        code: 'IDEM_500',
        userMessage: 'حدث خطأ غير متوقع أثناء تنفيذ العملية، يرجى المحاولة لاحقاً.',
        category: 'system',
        severity: 'critical',
        retryable: true,
        shouldAlert: true,
        technicalMessage:
          error instanceof Error ? error.message : 'Unknown idempotency execution error',
        cause: error,
        metadata: { key },
      });
    } finally {
      // 🛑 إيقاف الـ Heartbeat
      isExecuting = false;
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    }
  },
};

// ============================================================
// 🔓 Atomic Redis Lock Release (Lua Script)
// ============================================================

/**
 * تحرير القفل بشكل ذري (Compare-and-Delete)
 * 
 * يحمي من Lock Theft:
 * - لو الـ TTL خلص و worker تاني أخذ القفل
 * - الـ token مش هيطابق، ومش هنحذف القفل بتاعه
 */
async function releaseRedisLockAtomic(
  redis: Redis,
  key: string,
  lockToken: string
): Promise<void> {
  try {
    const released = await redis.eval(
      LUA_RELEASE_LOCK,
      [`lock:idempotency:${key}`],
      [lockToken]
    );

    if (released === 1) {
      // تم التحرير بنجاح
    } else {
      // القفل مش ملكنا (TTL خلص و worker تاني أخده) - ده طبيعي
      console.log(`ℹ️ Lock for key ${key} was not owned (already expired/taken over)`);
    }
  } catch (redisError) {
    // مش نرمي error هنا لأن الـ D1 record هو المصدر الحقيقي للحالة
    console.warn('⚠️ Failed to release Redis lock (non-critical):', redisError);
  }
}