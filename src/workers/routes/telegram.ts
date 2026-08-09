// src/worker/routes/telegram.ts

import { Hono, type Context, type Next } from 'hono';
import type { Env } from '@/lib/env';
import { safeExecute } from '@/lib/errors/safe-executor';
import { handleTelegramUpdate } from '@/lib/telegram/adapter'; 

// 🛡️ استيراد الـ Rate Limiter Client
import { checkRateLimit } from '@/lib/rate-limit-client';

/**
 * 🤖 Telegram Router
 * 
 * مسؤول عن استقبال Webhook، إرسال الرسائل، وإدارة الأخطاء.
 */
export const telegramRouter = new Hono<{ Bindings: Env }>();

// ============================================================
// 🛡️ Middleware: حماية المسارات الداخلية
// ============================================================
const requireInternalAuth = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const internalSecret = c.env.INTERNAL_API_SECRET || c.env.BETTER_AUTH_SECRET;
  const providedSecret = c.req.header('x-internal-secret');

  if (!internalSecret || providedSecret !== internalSecret) {
    return c.json({ ok: false, error: 'Unauthorized: Invalid internal secret' }, 401);
  }
  await next();
};

// ============================================================
// 🚀 المسارات (Routes)
// ============================================================

/**
 * POST /api/telegram/webhook
 * نقطة نهاية ويب هوك تليجرام الرئيسية (محمية بـ Rate Limit متطور)
 */
telegramRouter.post('/telegram/webhook', (c) =>
  safeExecute(async () => {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('❌ TELEGRAM_BOT_TOKEN is not configured');
      return c.json({ ok: false, error: 'Bot not configured' }, 500);
    }

    // 1️⃣ التحقق الاختياري من الـ Secret Token الخاص بـ Telegram
    const expectedSecret = c.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret = c.req.header('x-telegram-bot-api-secret-token');

    if (expectedSecret && receivedSecret && receivedSecret !== expectedSecret) {
      console.warn('⚠️ Unauthorized webhook attempt (Invalid secret token)');
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    const update = await c.req.json();

    // 2️⃣ استخراج chatId والـ IP و storeId لحماية الـ Webhook
    const message = update.message || update.callback_query?.message;
    const chatId = message?.chat?.id ? String(message.chat.id) : undefined;
    const text = update.message?.text || '';
    const storeIdMatch = text.match(/store_([a-zA-Z0-9_-]+)/);
    const storeId = storeIdMatch ? storeIdMatch[1] : undefined;
    const clientIp = c.req.header('cf-connecting-ip') || '0.0.0.0';

    // 🛡️ 3️⃣ تطبيق الـ Rate Limit عبر الـ Worker
    const rlResult = await checkRateLimit({
      action: 'telegram_webhook',
      ip: clientIp,
      userId: chatId,
      storeId: storeId,
    });

    if (!rlResult.allowed) {
      console.warn(`⚠️ Rate limit exceeded for Telegram Chat ID: ${chatId || 'unknown'}`);
      // نرجع status 200 حتى لا يكرر Telegram إرسال نفس الـ Webhook المقفول
      return c.json({ ok: false, error: 'Rate limit exceeded', retryAfter: rlResult.retryAfter }, 200);
    }

    console.log('📥 Telegram update received:', update.update_id || 'unknown');

    // 4️⃣ معالجة الـ Update عبر الـ Adapter
    await handleTelegramUpdate(c.env, update, botToken);

    return c.json({ ok: true });
  })
);

/**
 * POST /api/telegram/send
 * إرسال رسالة عبر تليجرام (محمي بـ Internal Secret)
 */
telegramRouter.post('/telegram/send', requireInternalAuth, (c) =>
  safeExecute(async () => {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return c.json({ ok: false, error: 'Bot not configured' }, 500);
    }

    const body = await c.req.json<{
      chatId: string;
      text: string;
      replyMarkup?: any;
    }>();

    if (!body.chatId || !body.text) {
      return c.json({ ok: false, error: 'chatId and text are required' }, 400);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: body.chatId,
          text: body.text,
          parse_mode: 'HTML',
          ...(body.replyMarkup && { reply_markup: body.replyMarkup }),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to send Telegram message:', errorText);
      return c.json({ ok: false, error: 'Failed to send message' }, 500);
    }

    return c.json({ ok: true });
  })
);

/**
 * GET /api/telegram/setup
 * إعداد ويب هوك تليجرام
 */
telegramRouter.get('/telegram/setup', (c) =>
  safeExecute(async () => {
    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return c.json({ ok: false, error: 'Bot not configured' }, 500);
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

    const result = (await response.json()) as { ok: boolean; description?: string };

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
 * إرسال خطأ إلى قناة الأخطاء (محمي بـ Internal Secret)
 */
telegramRouter.post('/telegram/error-channel', requireInternalAuth, (c) =>
  safeExecute(async () => {
    const errorBotToken = c.env.ERROR_BOT_TOKEN || c.env.TELEGRAM_BOT_TOKEN;
    if (!errorBotToken) {
      return c.json({ ok: false, error: 'Error bot not configured' }, 500);
    }

    const body = await c.req.json<{
      message: string;
      stack?: string;
      level?: 'critical' | 'warning' | 'info';
    }>();

    if (!body.message) {
      return c.json({ ok: false, error: 'message is required' }, 400);
    }

    const chatId = c.env.ERROR_CHANNEL_ID || c.env.TELEGRAM_ERROR_CHAT_ID;
    if (!chatId) {
      return c.json({ ok: false, error: 'Error channel not configured' }, 500);
    }

    const levelEmoji =
      body.level === 'critical' ? '🚨' : body.level === 'warning' ? '⚠️' : 'ℹ️';

    let text = `${levelEmoji} **[${(body.level || 'INFO').toUpperCase()}]**\n\n`;
    text += `📝 ${body.message}\n`;
    if (body.stack) {
      const truncatedStack =
        body.stack.length > 1000
          ? body.stack.slice(0, 1000) + '\n...(truncated)'
          : body.stack;
      text += `\n\`\`\`text\n${truncatedStack}\n\`\`\``;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${errorBotToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to send error to Telegram:', errorText);
      return c.json({ ok: false, error: 'Failed to send error' }, 500);
    }

    return c.json({ ok: true });
  })
);