// src/app/api/errors/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { classifyError } from '@/lib/errors/classifier';
import { sendErrorToTelegram } from '@/lib/errors/notifier';
import { type ErrorContext } from '@/lib/errors/types';
import { getEnv } from '@/lib/env'; // 👈 استيراد دالة الـ Env الموحدة

export const runtime = 'edge';

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

    // 1. استخدام الـ getEnv الموحدة (هتشتغل في كل البيئات)
    const env = getEnv();

    // 2. تحديث الـ Env بالكائنات المحددة اللي بيحتاجها الـ Notifier
    // لاحظ كيف دمجنا مسمياتك الخاصة هنا
    const notifierEnv = {
      ...env,
      TELEGRAM_BOT_TOKEN: process.env.ERROR_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '',
      TELEGRAM_ERROR_CHAT_ID: process.env.ERROR_CHANNEL_ID || env.TELEGRAM_ERROR_CHAT_ID || '',
    };

    const normalizedContext: ErrorContext = {
      storeId: String(storeIdOrSlug),
      path: context?.path || '/',
      userAgent: context?.userAgent || 'Unknown',
      ...context
    };

    const systemError = classifyError(rawError, normalizedContext);

    // 3. استدعاء الـ Notifier
    const notifierPromise = sendErrorToTelegram(systemError, notifierEnv as any);

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