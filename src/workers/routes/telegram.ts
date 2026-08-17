// src/worker/routes/telegram.ts

import { Hono, type Context, type Next } from 'hono';
import type { Env } from '@/lib/env';
import { safeExecute, SystemError } from '@/lib/errors';
import { handleTelegramUpdate } from '@/lib/telegram/adapter';
import { checkRateLimit } from '@/lib/rate-limit-client';

export const telegramRouter = new Hono<{ Bindings: Env }>();

// ============================================================
// 🔒 واجهات البيانات المحلية (Strict Interfaces)
// ============================================================

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdatePayload {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramApiResponse {
  ok: boolean;
  description?: string;
}

interface SendMessageRequestBody {
  chatId: string;
  text: string;
  replyMarkup?: Record<string, unknown>;
}

interface ErrorChannelRequestBody {
  message: string;
  stack?: string;
  level?: 'critical' | 'warning' | 'info';
}

// ============================================================
// 🛡️ Middleware: حماية المسارات الداخلية
// ============================================================

const requireInternalAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const internalSecret = c.env.INTERNAL_API_SECRET;
  const providedSecret = c.req.header('x-internal-secret');

  if (!internalSecret || providedSecret !== internalSecret) {
    throw new SystemError({
      code: 'UNAUTHORIZED_INTERNAL_ACCESS',
      userMessage: 'غير مصرح للوصول إلى هذا المسار الداخلي',
      technicalMessage: 'Invalid or missing x-internal-secret header',
      category: 'security',
      severity: 'warning',
      retryable: false,
      shouldAlert: false,
      metadata: { path: c.req.path },
    });
  }
  await next();
};

// ============================================================
// 🚀 المسارات (Routes)
// ============================================================

/**
 * POST /api/telegram/webhook
 * نقطة نهاية ويب هوك تليجرام الرئيسية لرسائل المستخدمين (تستخدم بوت التسجيل/التفاعل)
 */
telegramRouter.post('/telegram/webhook', (c) =>
  safeExecute(async () => {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new SystemError({
        code: 'TELEGRAM_BOT_NOT_CONFIGURED',
        userMessage: 'خدمة البوت غير مهيأة',
        technicalMessage: 'TELEGRAM_BOT_TOKEN is missing in environment variables',
        category: 'system',
        severity: 'critical',
        retryable: false,
        shouldAlert: true,
        metadata: { path: c.req.path },
      });
    }

    // 1️⃣ التحقق من الـ Secret Token الخاص بـ Telegram
    const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret = c.req.header('x-telegram-bot-api-secret-token');

    if (expectedSecret && receivedSecret && receivedSecret !== expectedSecret) {
      throw new SystemError({
        code: 'UNAUTHORIZED_WEBHOOK_TOKEN',
        userMessage: 'غير مصرح للوصول إلى الويب هوك',
        technicalMessage: 'x-telegram-bot-api-secret-token header mismatch',
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: true,
        metadata: { path: c.req.path },
      });
    }

    const update = await c.req.json<TelegramUpdatePayload>();

    // 2️⃣ استخراج البيانات لحماية الـ Rate Limit
    const message = update.message || update.callback_query?.message;
    const chatId = message?.chat?.id ? String(message.chat.id) : undefined;
    const text = update.message?.text || '';
    const storeIdMatch = text.match(/store_([a-zA-Z0-9_-]+)/);
    const storeId = storeIdMatch ? storeIdMatch[1] : undefined;
    const clientIp = c.req.header('cf-connecting-ip') || '0.0.0.0';

    // 🛡️ 3️⃣ تطبيق الـ Rate Limit
    const rlResult = await checkRateLimit({
      action: 'telegram_webhook',
      ip: clientIp,
      userId: chatId,
      storeId: storeId,
    });

    if (!rlResult.allowed) {
      throw new SystemError({
        code: 'TELEGRAM_RATE_LIMIT_EXCEEDED',
        userMessage: 'تم تجاوز الحد المسموح من الطلبات',
        technicalMessage: `Rate limit exceeded for chatId: ${chatId || 'unknown'}`,
        category: 'security',
        severity: 'warning',
        retryable: true,
        shouldAlert: false,
        storeId,
        metadata: { path: c.req.path, retryAfter: rlResult.retryAfter },
      });
    }

    console.log('📥 Telegram update received:', update.update_id ?? 'unknown');

    // 4️⃣ معالجة الـ Update في الخلفية
    c.executionCtx.waitUntil(
      handleTelegramUpdate(c.env, update, botToken).catch((err: unknown) => {
        console.error('❌ Background Telegram Update Error:', err);
      })
    );

    return c.json({ ok: true });
  })
);

/**
 * POST /api/telegram/send
 * إرسال رسالة عبر تليجرام لخدمة المستخدمين (محمي بـ Internal Secret)
 */
telegramRouter.post('/telegram/send', requireInternalAuth, (c) =>
  safeExecute(async () => {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new SystemError({
        code: 'TELEGRAM_BOT_NOT_CONFIGURED',
        userMessage: 'خدمة البوت غير مهيأة',
        technicalMessage: 'TELEGRAM_BOT_TOKEN is missing in environment variables',
        category: 'system',
        severity: 'critical',
        retryable: false,
        shouldAlert: true,
        metadata: { path: c.req.path },
      });
    }

    const body = await c.req.json<SendMessageRequestBody>();

    if (!body.chatId || !body.text) {
      throw new SystemError({
        code: 'MISSING_REQUIRED_FIELDS',
        userMessage: 'البيانات المطلوبة غير مكتملة',
        technicalMessage: 'chatId and text are required in body',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const payload: Record<string, unknown> = {
      chat_id: body.chatId,
      text: body.text,
      parse_mode: 'HTML',
    };

    if (body.replyMarkup) {
      payload.reply_markup = body.replyMarkup;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new SystemError({
        code: 'TELEGRAM_SEND_HTTP_FAILED',
        userMessage: 'فشل إرسال الرسالة عبر تليجرام',
        technicalMessage: `Telegram API error response: ${errorText}`,
        category: 'system',
        severity: 'critical',
        retryable: true,
        shouldAlert: true,
        metadata: { path: c.req.path, chatId: body.chatId },
      });
    }

    return c.json({ ok: true });
  })
);

/**
 * GET /api/telegram/setup
 * إعداد ويب هوك تليجرام الخاص ببوت التفاعل (محمي بـ Internal Secret)
 */
telegramRouter.get('/telegram/setup', requireInternalAuth, (c) =>
  safeExecute(async () => {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new SystemError({
        code: 'TELEGRAM_BOT_NOT_CONFIGURED',
        userMessage: 'خدمة البوت غير مهيأة',
        technicalMessage: 'TELEGRAM_BOT_TOKEN is missing in environment variables',
        category: 'system',
        severity: 'critical',
        retryable: false,
        shouldAlert: true,
        metadata: { path: c.req.path },
      });
    }

    const host = c.req.header('host') || 'www.dokany.workers.dev';
    const webhookUrl = c.env.TELEGRAM_WEBHOOK_URL || `https://${host}/api/telegram/webhook`;

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query'],
          secret_token: c.env.TELEGRAM_WEBHOOK_SECRET,
        }),
      }
    );

    const result = (await response.json()) as TelegramApiResponse;

    if (!result.ok) {
      throw new SystemError({
        code: 'TELEGRAM_SETUP_FAILED',
        userMessage: 'فشل إعداد الويب هوك الخاص بتليجرام',
        technicalMessage: `Telegram setWebhook API returned ok: false. Description: ${result.description || 'Unknown error'}`,
        category: 'system',
        severity: 'critical',
        retryable: true,
        shouldAlert: true,
        metadata: { path: c.req.path, webhookUrl },
      });
    }

    return c.json({
      ok: result.ok,
      data: result,
      webhookUrl,
      message: 'Webhook setup executed successfully.',
    });
  })
);

/**
 * POST /api/telegram/error-channel
 * إرسال خطأ إلى قناة الأخطاء عبر النظام الموحد (محمي بـ Internal Secret)
 * يولد SystemError مع إرسال تلقائي عبر ERROR_BOT_TOKEN المعتمد في نظام الأخطاء
 */
telegramRouter.post('/telegram/error-channel', requireInternalAuth, (c) =>
  safeExecute(async () => {
    const body = await c.req.json<ErrorChannelRequestBody>();

    if (!body.message) {
      throw new SystemError({
        code: 'MISSING_ERROR_MESSAGE',
        userMessage: 'رسالة الخطأ مطلوبة',
        technicalMessage: 'message field is required in request body',
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        metadata: { path: c.req.path },
      });
    }

    const level = body.level || 'info';
    const severityMap: Record<string, 'info' | 'warning' | 'critical'> = {
      critical: 'critical',
      warning: 'warning',
      info: 'info',
    };

    // النظام سيتولى توجيه هذا الخطأ مباشرة عبر ERROR_BOT_TOKEN
    throw new SystemError({
      code: `CHANNEL_${level.toUpperCase()}`,
      userMessage: 'تم إرسال التنبيه إلى قناة الأخطاء',
      technicalMessage: body.message,
      category: 'system',
      severity: severityMap[level] || 'info',
      retryable: false,
      shouldAlert: true,
      metadata: {
        path: c.req.path,
        stack: body.stack,
        source: 'telegram-error-channel-api',
      },
    });
  })
);