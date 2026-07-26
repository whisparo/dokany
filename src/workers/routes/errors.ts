//src/worker/routes/errors.ts

import { Hono } from 'hono';
import type { Env } from '@/lib/env';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import type { ErrorContext } from '@/lib/errors/types';

export const errorsRouter = new Hono<{ Bindings: Env }>();

errorsRouter.post('/errors/report', async (c) => {
  try {
    const body = await c.req.json<{ rawError: unknown; context: Partial<ErrorContext> }>();
    const { rawError, context } = body;

    const storeIdOrSlug = context?.storeId || (context as any)?.storeSlug;

    if (!storeIdOrSlug) {
      return c.json({ success: false, error: 'MISSING_STORE_IDENTIFIER' }, 400);
    }

    const normalizedContext: ErrorContext = {
      storeId: String(storeIdOrSlug),
      path: context?.path || '/',
      userAgent: context?.userAgent || c.req.header('user-agent') || 'Unknown',
      ...context,
    };

    const systemError = classifyError(rawError, normalizedContext);

    // إرسال الإشعار في الخلفية بدون تعطيل الاستجابة للـ Client
    c.executionCtx.waitUntil(
      sendErrorToTelegram(systemError, c.env).catch((err) =>
        console.error('Failed to notify error:', err)
      )
    );

    return c.json({ success: true, code: systemError.code });
  } catch (routeError) {
    console.error('🚨 [Report API] Failure:', routeError);
    return c.json({ success: false, error: 'INTERNAL_ROUTER_ERROR' }, 500);
  }
});