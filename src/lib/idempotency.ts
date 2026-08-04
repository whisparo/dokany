// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency';
import { eq, and, lte, sql } from 'drizzle-orm';
import type { Env } from '@/lib/env';

const PENDING_TIMEOUT_MS = 30 * 1000; // 30 ثانية بالمللي ثانية

export const idempotency = {
  async execute<T>(
    env: Env & Record<string, unknown>,
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const db = getDb(env);
    const nowMs = Date.now();

    // 1. محاولة الإدراج الذرية (Atomic Insert)
    const insertResult = await db
      .insert(idempotencyTable)
      .values({
        key,
        status: 'pending',
        createdAt: new Date(nowMs),
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyTable.key });

    // 2. إذا كان المفتاح موجوداً مسبقاً (Conflict)
    if (insertResult.length === 0) {
      const existing = await db
        .select()
        .from(idempotencyTable)
        .where(eq(idempotencyTable.key, key))
        .limit(1);

      if (existing.length === 0) {
        throw new Error('Idempotency key not found after conflict resolution');
      }

      const record = existing[0];

      // ✅ 2.1 العملية مكتملة بنجاح
      if (record.status === 'completed') {
        if (!record.result) return null as unknown as T;
        return JSON.parse(record.result) as T;
      }

      // 🛑 2.2 إعادة المحاولة بعد الفشل (Retry after Failure)
      if (record.status === 'failed') {
        const updateResult = await db
          .update(idempotencyTable)
          .set({
            status: 'pending',
            createdAt: new Date(nowMs),
            result: null,
          })
          .where(and(
            eq(idempotencyTable.key, key),
            eq(idempotencyTable.status, 'failed')
          ));

        if (updateResult.meta.changes === 0) {
          throw new Error('Operation already acquired by another request');
        }
      } 
      
      // 🛑 2.3 التعامل مع الـ Timeout للطلبات المعلقة (Atomic Timeout Lock)
      else if (record.status === 'pending') {
        const expiredThreshold = new Date(nowMs - PENDING_TIMEOUT_MS);

        // تحديث أتمي بشرط أن تكون الحالة pending وأن تكون نبتت من وقت أقدم من الـ Timeout
        const updateResult = await db
          .update(idempotencyTable)
          .set({
            createdAt: new Date(nowMs), // تجديد الـ Lock
          })
          .where(and(
            eq(idempotencyTable.key, key),
            eq(idempotencyTable.status, 'pending'),
            lte(idempotencyTable.createdAt, expiredThreshold) // حل مشكلة مقارنة الـ Dates بطلب D1 الذري
          ));

        if (updateResult.meta.changes === 0) {
          throw new Error('Operation already in progress, please retry later');
        }
      }
    }

    // 3. تنفيذ كود البزنس وتحديث النتيجة
    try {
      const result = await fn();

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
      // 4. تسجيل الفشل للطلب مع إمكانية إعادة المحاولة
      await db
        .update(idempotencyTable)
        .set({
          status: 'failed',
          result: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        })
        .where(eq(idempotencyTable.key, key));

      throw error;
    }
  },
};