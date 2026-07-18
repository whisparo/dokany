// src/app/api/errors/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import { type ErrorContext } from '@/lib/errors/types';
import { getEnv } from '@/lib/env';


export async function POST(req: NextRequest) {
  const ctx = (req as any).context;

  try {
    const body = await req.json();
    const { rawError, context } = body as {
      rawError: unknown;
      context: Partial<ErrorContext>;
    };

    const storeIdOrSlug = context?.storeId || (context as any)?.storeSlug;

    if (!storeIdOrSlug) {
      return NextResponse.json(
        { success: false, error: 'MISSING_STORE_IDENTIFIER' },
        { status: 400 }
      );
    }

    const env = getEnv();

    const normalizedContext: ErrorContext = {
      storeId: String(storeIdOrSlug),
      path: context?.path || '/',
      userAgent: context?.userAgent || 'Unknown',
      ...context,
    };

    const systemError = classifyError(rawError, normalizedContext);

    // ✅ تمرير env مباشرة
    const notifierPromise = sendErrorToTelegram(systemError, env);

    if (ctx?.waitUntil) {
      ctx.waitUntil(notifierPromise);
    } else {
      await notifierPromise;
    }

    return NextResponse.json({ success: true, code: systemError.code });
  } catch (routeError: any) {
    console.error('🚨 [Report API] Failure:', routeError);
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ROUTER_ERROR' },
      { status: 500 }
    );
  }
}