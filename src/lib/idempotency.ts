// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import type { Env } from '@/lib/env';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency';
import { eq, and, sql } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';

const PENDING_TIMEOUT_MS = 30 * 1000; // 30 ثانية قفل كحد أقصى للطلب المعلق

export const idempotency = {
  async execute<T>(
    env: Env,
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const db = getDb(env);
    const nowMs = Date.now();

    try {
      // 1️⃣ محاولة الإدراج الذرية (Atomic Insert)
      const insertResult = await db
        .insert(idempotencyTable)
        .values({
          key,
          status: 'pending',
          createdAt: nowMs as unknown as Date, // إسناد الميلي ثانية مباشرة للاتساق
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyTable.key });

      // 2️⃣ إذا كان المفتاح موجوداً مسبقاً (Conflict - الطلب تكرر)
      if (insertResult.length === 0) {
        const existing = await db
          .select()
          .from(idempotencyTable)
          .where(eq(idempotencyTable.key, key))
          .limit(1);

        if (existing.length === 0) {
          throw new SystemError({
            code: 'IDEM_500',
            userMessage: 'حدث خطأ أثناء التأكد من تكرار الطلب، يرجى المحاولة لاحقاً.',
            category: 'database',
            severity: 'critical',
            retryable: true,
            shouldAlert: true,
            technicalMessage: `Idempotency record missing after conflict detection for key: ${key}`,
          });
        }

        const record = existing[0];

        // 🟢 2.1 العملية مكتملة بنجاح سابقاً (Return Cached Result)
        if (record.status === 'completed') {
          if (!record.result) return null as unknown as T;
          return JSON.parse(record.result) as T;
        }

        // 🟠 2.2 إعادة المحاولة بعد فشل سابق (Retry after Failure)
        if (record.status === 'failed') {
          const updateResult = await db
            .update(idempotencyTable)
            .set({
              status: 'pending',
              createdAt: nowMs as unknown as Date,
              result: null,
            })
            .where(
              and(
                eq(idempotencyTable.key, key),
                eq(idempotencyTable.status, 'failed')
              )
            );

          if (updateResult.meta.changes === 0) {
            throw new SystemError({
              code: 'IDEM_409',
              userMessage: 'جاري معالجة طلبك حالياً بواسطة سيرفر آخر، يرجى الانتظار.',
              category: 'business',
              severity: 'info',
              retryable: true,
              shouldAlert: false,
              technicalMessage: `Failed to acquire lock for failed record ${key}. Race condition detected.`,
            });
          }
        } 
        
        // 🔴 2.3 التعامل مع الـ Timeout للطلبات المعلقة (Atomic Timeout Lock)
        else if (record.status === 'pending') {
          const thresholdMs = nowMs - PENDING_TIMEOUT_MS;

          // استخدام SQL صريح لحساب فرق الوقت بدقة على D1
          const updateResult = await db
            .update(idempotencyTable)
            .set({
              createdAt: nowMs as unknown as Date, // تجديد القفل
            })
            .where(
              and(
                eq(idempotencyTable.key, key),
                eq(idempotencyTable.status, 'pending'),
                sql`${idempotencyTable.createdAt} <= ${thresholdMs}`
              )
            );

          if (updateResult.meta.changes === 0) {
            throw new SystemError({
              code: 'IDEM_409',
              userMessage: 'طلبك قيد المعالجة حالياً، يرجى عدم إعادة التحديث.',
              category: 'business',
              severity: 'info',
              retryable: true,
              shouldAlert: false,
              technicalMessage: `Operation with key ${key} is active and currently in progress.`,
            });
          }
        }
      }

      // 3️⃣ تنفيذ الكود الممرر (Business Logic) وحفظ النتيجة
      const result = await fn();

      await db
        .update(idempotencyTable)
        .set({
          status: 'completed',
          result: result !== undefined ? JSON.stringify(result) : null,
          completedAt: Date.now() as unknown as Date,
        })
        .where(eq(idempotencyTable.key, key));

      return result;
    } catch (error) {
      // إذا كان الخطأ أصلاً SystemError وليس خطأ تنفيذي داخل fn، سجل الفشل في الجدول ثم ارمِه
      if (error instanceof SystemError && error.code.startsWith('IDEM_')) {
        throw error;
      }

      // 4️⃣ تسجيل حالة الفشل لتسمح بالـ Retry لاحقاً
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
        console.error('⚠️ Failed to update idempotency status to failed:', dbError);
      }

      throw error;
    }
  },
};