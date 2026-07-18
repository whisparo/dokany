// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency';
import { eq, and } from 'drizzle-orm';
import type { Env } from '@/lib/env';

const PENDING_TIMEOUT_SECONDS = 30;

export const idempotency = {
  async execute<T>(
    env: Env & Record<string, unknown>,
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const db = getDb(env);

    // 1. محاولة الإدراج الذرية (الخطوة دي سليمة عندك)
    const insertResult = await db
      .insert(idempotencyTable)
      .values({
        key,
        status: 'pending',
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyTable.key });

    // 2. إذا كان المفتاح موجوداً مسبقاً
    if (insertResult.length === 0) {
      const existing = await db
        .select()
        .from(idempotencyTable)
        .where(eq(idempotencyTable.key, key))
        .limit(1);

      if (existing.length === 0) {
        throw new Error('Idempotency key not found after conflict');
      }

      const record = existing[0];

      // ✅ حالة مكتملة بنجاح
      if (record.status === 'completed') {
        return JSON.parse(record.result!);
      }

      // 🛑 حماية ضد الـ Race Condition في حالة إعادة المحاولة (Failed)
      if (record.status === 'failed') {
        const updateResult = await db
          .update(idempotencyTable)
          .set({
            status: 'pending',
            createdAt: new Date(),
            result: null, // تصفير رسالة الخطأ السابقة
          })
          .where(and(
            eq(idempotencyTable.key, key),
            eq(idempotencyTable.status, 'failed') // الحماية هنا!
          ));

        // لو مفيش صفوف اتحدثت، معناه إن طلب متزامن تاني خطف الـ Lock وحولها لـ pending
        if (updateResult.meta.changes === 0) {
          throw new Error('Operation already in progress, please retry later');
        }
      }
      
      // 🛑 حماية ضد الـ Race Condition في حالة الـ Timeout
      else if (record.status === 'pending') {
        const now = new Date();
        const elapsed = (now.getTime() - new Date(record.createdAt).getTime()) / 1000;

        if (elapsed > PENDING_TIMEOUT_SECONDS) {
          const updateResult = await db
            .update(idempotencyTable)
            .set({
              status: 'pending',
              createdAt: new Date(), // تجديد الـ Lock لـ 30 ثانية جديدة
            })
            .where(and(
              eq(idempotencyTable.key, key),
              eq(idempotencyTable.status, 'pending'), // الحماية هنا!
              eq(idempotencyTable.createdAt, record.createdAt) // التأكد إن التوقيت لم يتغير
            ));

          if (updateResult.meta.changes === 0) {
            throw new Error('Operation already in progress, please retry later');
          }
        } else {
          throw new Error('Operation already in progress, please retry later');
        }
      }
    }

    // 3. تنفيذ كود البزنس الآمن
    try {
      const result = await fn();

      await db
        .update(idempotencyTable)
        .set({
          status: 'completed',
          result: JSON.stringify(result),
          completedAt: new Date(),
        })
        .where(eq(idempotencyTable.key, key));

      return result;
    } catch (error) {
      // 4. تسجيل الفشل بدقة لتسهيل إعادة المحاولة الآمنة
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