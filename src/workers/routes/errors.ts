// src/worker/routes/errors.ts

import { Hono } from 'hono';
import type { Env } from '@/lib/env';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import type { ErrorContext } from '@/lib/errors/types';

export const errorsRouter = new Hono<{ Bindings: Env }>();

/**
 * واجهة طلب تقرير الأخطاء المباشرة لتجنب استخدام any
 */
interface ReportErrorPayload {
  rawError?: unknown;
  context?: Partial<ErrorContext> & {
    storeSlug?: string;
  };
}

errorsRouter.post('/errors/report', async (c) => {
  try {
    const body = await c.req.json<ReportErrorPayload>();
    const { rawError, context } = body;

    if (!context) {
      return c.json({ success: false, error: 'MISSING_CONTEXT' }, 400);
    }

    // استخراج معرف المتجر سواء كان ID أو Slug بدون استخدام any
    const storeIdOrSlug = context.storeId || context.storeSlug;

    if (!storeIdOrSlug || typeof storeIdOrSlug !== 'string' || storeIdOrSlug.trim() === '') {
      return c.json({ success: false, error: 'MISSING_STORE_IDENTIFIER' }, 400);
    }

    const normalizedContext: ErrorContext = {
      ...context,
      storeId: storeIdOrSlug.trim(),
      path: context.path || c.req.path || '/',
      userAgent: context.userAgent || c.req.header('user-agent') || 'Unknown',
    };

    const systemError = classifyError(rawError, normalizedContext);

    // إرسال الإشعار في الخلفية مع waitUntil لعدم تعطيل الـ Response
    c.executionCtx.waitUntil(
      sendErrorToTelegram(systemError, c.env).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('❌ [Report API] Failed to notify error via Telegram:', msg);
      })
    );

    return c.json({ success: true, code: systemError.code }, 200);
  } catch (routeError) {
    const errorMessage = routeError instanceof Error ? routeError.message : String(routeError);
    console.error('🚨 [Report API] Failure:', errorMessage);
    
    return c.json({ success: false, error: 'INTERNAL_ROUTER_ERROR' }, 500);
  }
});