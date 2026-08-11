// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency';
import { eq, and, lte } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';

// ⏱️ المدة الزمنية للقفل المعلق (30 ثانية)
const PENDING_LOCK_TTL_MS = 30 * 1000;

export const idempotency = {
  async execute<T>(
    env: CloudflareEnv,
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const db = getDb(env);
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + PENDING_LOCK_TTL_MS);

    try {
      // 1️⃣ محاولة الإدراج الذرية (Atomic Lock Acquisition)
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

      // 2️⃣ في حالة وجود السجل مسبقاً (Conflict)
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

        // 🟢 2.1 العملية مكتملة بنجاح (Return Cached Result)
        if (record.status === 'completed') {
          if (!record.result) return null as T;
          return JSON.parse(record.result) as T;
        }

        // 🟠 2.2 الطلب انتهت صلاحية قفله (Expired Lock Renewal) أو فشل سابقاً (Failed Retry)
        const isExpired = record.status === 'pending' && record.expiresAt.getTime() <= now.getTime();
        const isFailed = record.status === 'failed';

        if (isExpired || isFailed) {
          // محاولة استعادة القفل بشكل ذري (Atomic Lock Takeover)
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
                // ضابط سباق التنفيذ (Race Condition Guard)
                isExpired 
                  ? lte(idempotencyTable.expiresAt, now)
                  : eq(idempotencyTable.status, 'failed')
              )
            );

          if (updateResult.meta.changes === 0) {
            throw new SystemError({
              code: 'IDEM_409',
              userMessage: 'طلبك قيد المعالجة حالياً من قِبل سيرفر آخر، يرجى الانتظار.',
              category: 'business',
              severity: 'info',
              retryable: true,
              shouldAlert: false,
              technicalMessage: `Failed atomic lock takeover for key: ${key}. Concurrent request won the race.`,
            });
          }
        } else {
          // 🔴 2.3 الطلب ما زال قيد المعالجة النشطة (Active Pending)
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

      // 3️⃣ تنفيذ الـ Business Logic
      const result = await fn();

      // 4️⃣ حفظ النتيجة وتعليم العملية كـ Completed
      await db
        .update(idempotencyTable)
        .set({
          status: 'completed',
          result: result !== undefined ? JSON.stringify(result) : null,
          completedAt: new Date(),
        })
        .where(eq(idempotencyTable.key, key));

      return result;

    } catch (error) {
      if (error instanceof SystemError && error.code.startsWith('IDEM_')) {
        throw error;
      }

      // 5️⃣ تسجيل الفشل لتسمح بالـ Retry المباشر
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

      throw error;
    }
  },
};