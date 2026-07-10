// src/workers/index.ts
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { runWithContext } from '@/lib/context';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const url = new URL(request.url);
    const storeId = request.headers.get('x-store-id') || 'default-store';
    const startTime = performance.now();

    return runWithContext({ correlationId, storeId, path: url.pathname }, async () => {
      try {
        const db = getDb(env);
        const users = await db.select().from(schema.users);

        // سجل نجاح الطلب (للمراقبة)
        console.log(`✅ [${correlationId}] ${request.method} ${url.pathname} - 200 OK (${performance.now() - startTime}ms)`);

        return Response.json({
          success: true,
          data: users,
          meta: {
            count: users.length,
            correlationId,
          },
        });
      } catch (error) {
        // تصنيف الخطأ للحصول على كود ورسالة مناسبة للمستخدم
        const systemError = classifyError(error, {
          storeId,
          correlationId,
          path: url.pathname,
          method: request.method,
        });

        // تسجيل الخطأ في السجلات
        console.error(`❌ [${correlationId}] ${request.method} ${url.pathname} - ${systemError.code}`, error);

        // ✅ إرسال الخطأ إلى تليجرام (مع محاولة آمنة)
        try {
          await sendErrorToTelegram(systemError, env);
        } catch (notifyError) {
          // لا نريد أن يفشل الطلب بسبب فشل الإشعار
          console.error('❌ Failed to send error notification:', notifyError);
        }

        // إرجاع استجابة خطأ منظمة للعميل
        const statusCode =
          systemError.category === 'security' ? 403 :
          systemError.category === 'business' ? 400 :
          500;

        return Response.json(
          {
            success: false,
            error: {
              code: systemError.code,
              message: systemError.userMessage,
              correlationId: systemError.context?.correlationId || correlationId,
            },
          },
          { status: statusCode }
        );
      }
    });
  },
};