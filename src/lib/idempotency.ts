// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency';
import { eq, and, lte } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';
import type { D1Database } from '@cloudflare/workers-types';

const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000; // 300 ثانية (5 دقائق)

interface IdempotencyOptions {
  /** مدة القفل بالمللي ثانية (افتراضي: 30 ثانية) */
  lockTTLMs?: number;
}

export const idempotency = {
  async execute<T>(
    env: { DB: D1Database; UPSTASH_REDIS_REST_URL?: string; UPSTASH_REDIS_REST_TOKEN?: string },
    key: string,
    fn: () => Promise<T>,
    options: IdempotencyOptions = {}
  ): Promise<T> {
    const { lockTTLMs = DEFAULT_LOCK_TTL_MS } = options;
    const db = getDb(env as any);
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + lockTTLMs);
    
    // معرف فريد للعملية لمنع Lock Theft في Redis
    const lockToken = crypto.randomUUID();

    // 🔒 1. محاولة القفل عبر Redis
    let redisLockAcquired = false;
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        });
        
        // يخزن token فريد بدلاً من نص ثابت 'pending'
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
        console.warn('⚠️ Redis lock failed, falling back to D1:', redisError);
        redisLockAcquired = false;
      }
    }

    try {
      // 2️⃣ محاولة الإدراج الذرية في D1
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

      // 3️⃣ التعامل مع حالة وجود السجل مسبقاً (Conflict)
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
              return JSON.parse(record.result) as T;
            } catch {
              console.warn(`⚠️ Invalid JSON in idempotency result for key ${key}`);
            }
          }
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

        // 🟠 3.2 القفل منتهي الصلاحية أو العملية سقطت سابقاً (Expired / Failed Takeover)
        const isExpired = record.status === 'pending' && (record.expiresAt?.getTime() ?? 0) <= now.getTime();
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

          // 🛑 إذا فشل التنافس على استعادة القفل، ارمِ الخطأ وتوقف فوراً!
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

      // 4️⃣ تنفيذ المنطق التجاري (Business Logic Execution)
      const result = await fn();

      // 5️⃣ حفظ النتيجة وتعليم العملية كـ Completed
      await db
        .update(idempotencyTable)
        .set({
          status: 'completed',
          result: result !== undefined ? JSON.stringify(result) : null,
          completedAt: new Date(),
        })
        .where(eq(idempotencyTable.key, key));

      // 🔓 تحرير آمن لقفل Redis (Safe Lock Release)
      if (redisLockAcquired) {
        await releaseRedisLock(env, key, lockToken);
      }

      return result;

    } catch (error) {
      // 🛑 حماية: عدم تعديل حالة D1 إذا كان الخطأ هو رفض التكرار (IDEM_409)
      const isConcurrencyConflict = error instanceof SystemError && error.code === 'IDEM_409';

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

      // 🔓 تحرير قفل Redis عند الفشل
      if (redisLockAcquired) {
        await releaseRedisLock(env, key, lockToken);
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
        technicalMessage: error instanceof Error ? error.message : 'Unknown idempotency execution error',
        cause: error,
        metadata: { key },
      });
    }
  },
};

// 🛠️ دالة تحرير القفل الآمنة لمنع Lock Theft
async function releaseRedisLock(
  env: { UPSTASH_REDIS_REST_URL?: string; UPSTASH_REDIS_REST_TOKEN?: string },
  key: string,
  lockToken: string
) {
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    });
    
    // التحقق من أن القفل المملوك هو نفس الـ lockToken قبل الحذف
    const currentToken = await redis.get<string>(`lock:idempotency:${key}`);
    if (currentToken === lockToken) {
      await redis.del(`lock:idempotency:${key}`);
    }
  } catch (redisError) {
    console.warn('⚠️ Failed to release Redis lock:', redisError);
  }
}