// src/workers/index.ts
import type { ExportedHandler } from '@cloudflare/workers-types';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { runWithContext } from '@/lib/context';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';

// طالما بنبني عظمة، نلتزم بالأنواع الرسمية للـ Cloudflare Workers لمنع أي تضارب مستقبلي
const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const url = new URL(request.url);
    const storeId = request.headers.get('x-store-id') || 'default-store';
    const startTime = performance.now();

    return runWithContext({ correlationId, storeId, path: url.pathname }, async () => {
      try {
        const db = getDb(env);
        const users = await db.select().from(schema.users);

        // سجل نجاح الطلب (للمراقبة والأداء)
        console.log(`✅ [${correlationId}] ${request.method} ${url.pathname} - 200 OK (${(performance.now() - startTime).toFixed(2)}ms)`);

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

        // تسجيل الخطأ في الـ Cloudflare Logs فوراً
        console.error(`❌ [${correlationId}] ${request.method} ${url.pathname} - ${systemError.code}`, error);

        // 🔥 قمة العظمة البرمجية: إرسال التليجرام في الخلفية بدون تعطيل العميل بملي ثانية واحدة
        ctx.waitUntil(
          (async () => {
            try {
              await sendErrorToTelegram(systemError, env);
            } catch (notifyError) {
              // لا نريد أن يفشل الطلب أو ينهار الـ Worker بسبب فشل الإشعار
              console.error('❌ [Background Task] Failed to send error notification to Telegram:', notifyError);
            }
          })()
        );

        // إرجاع استجابة خطأ منظمة ومحمية للعميل بناءً على التصنيف
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

export default worker;