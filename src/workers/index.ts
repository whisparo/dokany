// src/workers/index.ts

import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { getDb } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { runWithContext } from '@/lib/context'; 
import { classifyError } from '@/lib/errors/classifier'; 
import { sendErrorToTelegram } from '@/lib/errors/notifier'; 

// ✅ الـ Env النهائية بعد تفعيل الـ R2
export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket; // تم تفعيل الـ R2
  B2_ENDPOINT: string;
  B2_BUCKET_NAME: string;
  B2_ACCESS_KEY_ID: string;
  B2_SECRET_ACCESS_KEY: string;
  TELEGRAM_ERROR_CHAT_ID: string;
  TELEGRAM_BOT_TOKEN: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  QSTASH_TOKEN: string;
  [key: string]: unknown; 
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const url = new URL(request.url);
    const storeId = request.headers.get('x-store-id') || 'default-store'; 

    return runWithContext({ correlationId, storeId, path: url.pathname }, async () => {
      try {
        const db = getDb(env);
        const users = await db.select().from(schema.users);
        return Response.json(users);

      } catch (error) {
        // تشخيص الخطأ مع سياق الـ Context
        const systemError = classifyError(error, { 
          storeId,
          correlationId,
          path: url.pathname, 
          method: request.method 
        });

        // ✅ تم تفعيل الإخطارات عبر تليجرام
        // الـ sendErrorToTelegram غالباً جواها بتستخدم env.R2_BUCKET 
        // لحفظ الـ Error Trace كملف JSON
        await sendErrorToTelegram(systemError, env);

        return Response.json(
          {
            success: false,
            error: {
              code: systemError.code,
              message: systemError.userMessage, 
              correlationId: systemError.context?.correlationId
            }
          },
          { 
            status: systemError.category === 'security' ? 403 : systemError.category === 'business' ? 400 : 500 
          }
        );
      }
    });
  }
};