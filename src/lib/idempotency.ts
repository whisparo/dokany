// src/lib/idempotency.ts

import { getDb } from '@/lib/db';
import { idempotency as idempotencyTable } from '@/lib/db/schema/idempotency'; 
import { eq, and, lt } from 'drizzle-orm';
import type { Env } from '@/workers';

const PENDING_TIMEOUT_SECONDS = 30;

export const idempotency = {
  async execute<T>(
    env: Env & Record<string, unknown>,
    key: string, 
    fn: () => Promise<T>
  ): Promise<T> {
    const db = getDb(env);

    // 1. محاولة الإدراج الذرية (نفس الكود القديم)
    const insertResult = await db
      .insert(idempotencyTable)
      .values({
        key,
        status: 'pending',
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ key: idempotencyTable.key });

    // 2. إذا كان هناك تعارض (المفتاح موجود مسبقاً)
    if (insertResult.length === 0) {
      // جلب السجل القديم
      const existing = await db
        .select()
        .from(idempotencyTable)
        .where(eq(idempotencyTable.key, key))
        .limit(1);

      if (existing.length === 0) {
        throw new Error('Idempotency key not found after conflict');
      }

      const record = existing[0];

      // ✅ حالة مكتملة بنجاح → إرجاع النتيجة فوراً
      if (record.status === 'completed') {
        return JSON.parse(record.result!);
      }

      // ✅ حالة فشل سابقة → نسمح بإعادة المحاولة (نُحدّث إلى pending ونكمل)
      if (record.status === 'failed') {
        await db
          .update(idempotencyTable)
          .set({
            status: 'pending',
            createdAt: new Date(), // تجديد الوقت
          })
          .where(eq(idempotencyTable.key, key));
        
        // نكمل إلى الخطوة 3 لتنفيذ fn()
      }
      // ✅ حالة معلقة (Pending) ولكن انتهت صلاحيتها (أكثر من 30 ثانية)
      else if (record.status === 'pending') {
        const now = new Date();
        const elapsed = (now.getTime() - new Date(record.createdAt).getTime()) / 1000;
        
        if (elapsed > PENDING_TIMEOUT_SECONDS) {
          // نعتبر أنها فشلت، نحدّثها إلى failed ونسمح بإعادة المحاولة
          await db
            .update(idempotencyTable)
            .set({
              status: 'failed',
              result: JSON.stringify({ error: 'Timeout: Operation took too long' }),
            })
            .where(eq(idempotencyTable.key, key));
          
          // نعيد المحاولة (نمرّر الطلب الحالي ليكون هو المُنفذ الجديد)
          // هنا نستخدم recursion بسيطة أو نعيد تشغيل الدالة.
          // الأفضل: نستدعي execute مرة أخرى (لكن احذر من الحلقات اللانهائية، استخدم while أو return this.execute)
          // لكن للتبسيط، سنقوم بتحديث الحالة إلى pending ونكمل.
          await db
            .update(idempotencyTable)
            .set({
              status: 'pending',
              createdAt: new Date(),
            })
            .where(eq(idempotencyTable.key, key));
        } else {
          // لا تزال قيد المعالجة منذ أقل من 30 ثانية → نرفض الطلب
          throw new Error('Operation already in progress, please retry later');
        }
      }

      // بعد معالجة الحالات الخاصة (failed أو pending منتهي الصلاحية)،
      // نمرّر إلى أسفل لتنفيذ fn().
      // لكننا نحتاج إلى التأكد من أننا في المسار الصحيح.
      // أسهل طريقة: إذا لم نعد من الدالة حتى الآن، نستمر.
    }

    // 3. تنفيذ كود البزنس (العملية الأساسية)
    try {
      const result = await fn();

      // تحديث السجل وحفظ النتيجة (نجاح)
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
      // 4. ✅ عند الفشل: لا نحذف المفتاح!
      // نقوم بتحديث الحالة إلى failed مع تخزين رسالة الخطأ (لمنع إعادة المحاولة من الصفر)
      await db
        .update(idempotencyTable)
        .set({
          status: 'failed',
          result: JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }),
        })
        .where(eq(idempotencyTable.key, key));
        
      throw error;
    }
  },
};