// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency'; 
import { eq } from 'drizzle-orm';
import type { Env } from '@/workers';

export const idempotency = {
  /**
   * تنفيذ كود البزنس بشكل ذري (Atomic) يضمن عدم التكرار حتى لو تم استدعاء الطلب بالتوازي
   */
  async execute<T>(
    env: Env & Record<string, unknown>, // ✅ تم دمج الـ Index Signature لحل تضارب تيبات Drizzle
    key: string, 
    fn: () => Promise<T>
  ): Promise<T> {
    const db = getDb(env);

    // 1. محاولة الإدراج الذرية - إذا كان المفتاح موجوداً مسبقاً، لن يتم إدخال شيء
    const insertResult = await db
      .insert(idempotencyTable)
      .values({
        key,
        status: 'pending',
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyTable.key });

    // 2. إذا كانت المصفوفة فارغة، فهناك Conflict (الطلب مكرر أو قيد التنفيذ)
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

      // إذا كانت مكتملة بنجاح، رجّع النتيجة فوراً للعميل
      if (record.status === 'completed') {
        return JSON.parse(record.result!);
      }

      // إذا كانت لا تزال جارية من طلب موازي
      if (record.status === 'pending') {
        throw new Error('Operation already in progress');
      }
      
      throw new Error(`Transaction failed previously with status: ${record.status}`);
    }

    // 3. تنفيذ كود البزنس (العملية الأساسية)
    try {
      const result = await fn();

      // تحديث السجل وحفظ النتيجة
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
      // 4. طوق النجاة: في حال الفشل نمسح المفتاح تماماً لتسهيل إعادة المحاولة لاحقاً
      await db
        .delete(idempotencyTable)
        .where(eq(idempotencyTable.key, key));
        
      throw error;
    }
  },
};