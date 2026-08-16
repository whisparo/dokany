// src/lib/services/alert-service.ts

import type { Env } from '@/lib/env';

// ============================================================
// 🎯 الأنواع (Types)
// ============================================================

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export interface AlertPayload {
  severity: AlertSeverity;
  event: string;
  storeId: string;
  productId?: string;
  message: string; // Markdown-formatted
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface AlertResult {
  telegram: { success: boolean; error?: string };
  console: { success: boolean };
}

// Payloads الخاصة بالأحداث
export interface LowStockPayload {
  storeId: string;
  productId: string;
  currentStock: number;
}

export interface FallbackActivatedPayload {
  storeId: string;
  productId: string;
  reason: string;
}

export interface CompensationPayload {
  storeId: string;
  productId: string;
  quantity: number;
  usedFallback: boolean;
}

export interface CriticalFailurePayload {
  storeId: string;
  productId: string;
  quantity: number;
  usedFallback: boolean;
  error: unknown;
}

// ============================================================
// 🧠 Deduplication Cache (منع إغراق التاجر بالتنبيهات)
// ============================================================
// Map<dedupeKey, expiresAt>
const dedupeCache = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000; // دقيقة واحدة

function getDedupeKey(payload: AlertPayload): string {
  // ندَمج الـ event + storeId + productId (لو موجود)
  return `${payload.event}:${payload.storeId}:${payload.productId ?? 'global'}`;
}

function isDuplicate(payload: AlertPayload): boolean {
  const key = getDedupeKey(payload);
  const now = Date.now();
  const expiresAt = dedupeCache.get(key);

  // تنظيفEntries القديمة (كل 10 مرات لمنع التضخم)
  if (dedupeCache.size > 100) {
    for (const [k, exp] of dedupeCache.entries()) {
      if (exp < now) dedupeCache.delete(k);
    }
  }

  if (expiresAt && expiresAt > now) {
    return true; // مفيش تكرار خلال الدقيقة
  }

  // 🚨 التنبيهات الحرجة متتكررش (دايماً مهمة)
  if (payload.severity !== AlertSeverity.CRITICAL) {
    dedupeCache.set(key, now + DEDUPE_WINDOW_MS);
  }

  return false;
}

// ============================================================
// 📡 قلب نظام التنبيهات (Alert Service)
// ============================================================

export class AlertService {
  /**
   * إرسال تنبيه عام (يُستخدم داخلياً)
   * 
   * @param env Cloudflare environment bindings
   * @param waitUntil Cloudflare ctx.waitUntil (لـ non-blocking dispatch)
   */
  private static async dispatch(
    env: Env,
    payload: AlertPayload,
    waitUntil?: (promise: Promise<unknown>) => void
  ): Promise<AlertResult> {
    // ✅ Deduplication: منع إرسال نفس التنبيه مرتين خلال دقيقة
    if (isDuplicate(payload)) {
      console.log(`[AlertService] ⏭️ Deduplicated: ${payload.event} for ${payload.storeId}`);
      return {
        telegram: { success: true, error: 'deduplicated' },
        console: { success: true },
      };
    }

    // ✅ Logging channel (دائماً يشتغل)
    this.logToConsole(payload);

    // ✅ Telegram channel (async)
    const telegramPromise = this.sendToTelegram(env, payload);

    // ✅ لو فيه waitUntil، نستخدمه عشان ما نأخرش الـ response
    if (waitUntil) {
      waitUntil(telegramPromise);
      return {
        telegram: { success: true },
        console: { success: true },
      };
    }

    // لو مفيش waitUntil، ننتظر النتيجة
    try {
      await telegramPromise;
      return {
        telegram: { success: true },
        console: { success: true },
      };
    } catch (error) {
      return {
        telegram: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        console: { success: true },
      };
    }
  }

  // ============================================================
  // 📢 دوال التنبيه العامة (Public Notification Methods)
  // ============================================================

  /**
   * ⚠️ تنبيه نقص المخزون (المخزون ≤ 5)
   */
  public static async notifyLowStock(
    env: Env,
    data: LowStockPayload,
    waitUntil?: (promise: Promise<unknown>) => void
  ): Promise<void> {
    const message =
      `⚠️ *تنبيه مخزون منخفض*\n\n` +
      `🏪 المتجر: \`${data.storeId.slice(0, 8)}...\`\n` +
      `📦 المنتج: \`${data.productId.slice(0, 8)}...\`\n` +
      `📊 المتبقي: *${data.currentStock}* قطعة فقط`;

    await this.dispatch(
      env,
      {
        severity: AlertSeverity.WARNING,
        event: 'LOW_STOCK',
        storeId: data.storeId,
        productId: data.productId,
        message,
        metadata: { currentStock: data.currentStock },
        timestamp: new Date(),
      },
      waitUntil
    );
  }

  /**
   * 🟡 تنبيه تفعيل وضع الطوارئ (Fallback Activated)
   */
  public static async notifyFallbackActivated(
    env: Env,
    data: FallbackActivatedPayload,
    waitUntil?: (promise: Promise<unknown>) => void
  ): Promise<void> {
    const message =
      `🟡 *تفعيل وضع الطوارئ (Fallback)*\n\n` +
      `🏪 المتجر: \`${data.storeId.slice(0, 8)}...\`\n` +
      `📦 المنتج: \`${data.productId.slice(0, 8)}...\`\n` +
      `📝 السبب: \`${data.reason}\`\n\n` +
      `_النظام يعمل على D1 مباشرة حتى عودة Redis_`;

    await this.dispatch(
      env,
      {
        severity: AlertSeverity.WARNING,
        event: 'FALLBACK_ACTIVATED',
        storeId: data.storeId,
        productId: data.productId,
        message,
        metadata: { reason: data.reason },
        timestamp: new Date(),
      },
      waitUntil
    );
  }

  /**
   * ℹ️ تنبيه نجاح التعويض (للكميات الكبيرة فقط ≥ 5)
   */
  public static async notifyCompensation(
    env: Env,
    data: CompensationPayload,
    waitUntil?: (promise: Promise<unknown>) => void
  ): Promise<void> {
    // لا نرسل تنبيه للكميات الصغيرة لتقليل الإزعاج
    if (data.quantity < 5) return;

    const message =
      `🔄 *تعويض مخزون ناجح*\n\n` +
      `🏪 المتجر: \`${data.storeId.slice(0, 8)}...\`\n` +
      `📦 المنتج: \`${data.productId.slice(0, 8)}...\`\n` +
      `🔢 الكمية المعوضة: *${data.quantity}* قطعة\n` +
      `🔧 المصدر: ${data.usedFallback ? 'D1 (Fallback)' : 'Redis'}`;

    await this.dispatch(
      env,
      {
        severity: AlertSeverity.INFO,
        event: 'COMPENSATION_SUCCESS',
        storeId: data.storeId,
        productId: data.productId,
        message,
        metadata: { quantity: data.quantity, usedFallback: data.usedFallback },
        timestamp: new Date(),
      },
      waitUntil
    );
  }

  /**
   * 🚨 تنبيه فشل التعويض الحرج (يتطلب تدخل يدوي)
   */
  public static async notifyCriticalFailure(
    env: Env,
    data: CriticalFailurePayload,
    waitUntil?: (promise: Promise<unknown>) => void
  ): Promise<void> {
    const errorMessage =
      data.error instanceof Error ? data.error.message : String(data.error);

    const message =
      `🚨 *فشل تعويض مخزون - تدخل يدوي مطلوب!*\n\n` +
      `🏪 المتجر: \`${data.storeId.slice(0, 8)}...\`\n` +
      `📦 المنتج: \`${data.productId.slice(0, 8)}...\`\n` +
      `🔢 الكمية: *${data.quantity}* قطعة\n` +
      `🔧 المصدر: ${data.usedFallback ? 'D1 (Fallback)' : 'Redis'}\n` +
      `❌ الخطأ: \`${errorMessage.slice(0, 200)}\`\n\n` +
      `⚠️ *يرجى التحقق من حالة المخزون في D1 و Redis*`;

    await this.dispatch(
      env,
      {
        severity: AlertSeverity.CRITICAL,
        event: 'CRITICAL_COMPENSATION_FAILURE',
        storeId: data.storeId,
        productId: data.productId,
        message,
        metadata: {
          quantity: data.quantity,
          usedFallback: data.usedFallback,
          error: errorMessage,
        },
        timestamp: new Date(),
      },
      waitUntil
    );
  }

  // ============================================================
  // 📨 قناة التيليجرام (Telegram Channel)
  // ============================================================

  private static async sendToTelegram(
    env: Env,
    payload: AlertPayload
  ): Promise<void> {
    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.ADMIN_TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      console.warn('[AlertService] ⚠️ Telegram credentials missing, skipping message.');
      return;
    }

    // ✅ استخدام Markdown مباشرة (أبسط وأسرع من HTML conversion)
    const fullText =
      `*📢 ${payload.event}*\n\n` +
      `${payload.message}\n\n` +
      `🕒 _${payload.timestamp.toISOString()}_`;

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: fullText,
          parse_mode: 'Markdown', // ✅ Markdown بدلاً من HTML
          disable_notification: payload.severity === AlertSeverity.INFO,
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[AlertService] ❌ Telegram send failed (${response.status}): ${errorText}`
        );
        throw new Error(`Telegram API error: ${response.status}`);
      }
    } catch (error) {
      console.error('[AlertService] ❌ Telegram fetch error:', error);
      throw error;
    }
  }

  // ============================================================
  // 🪵 قناة السجلات (Console Logger Channel)
  // ============================================================

  private static logToConsole(payload: AlertPayload): void {
    const logEntry = {
      timestamp: payload.timestamp.toISOString(),
      severity: payload.severity,
      event: payload.event,
      storeId: payload.storeId,
      productId: payload.productId || null,
      message: payload.message,
      metadata: payload.metadata || null,
    };

    if (payload.severity === AlertSeverity.CRITICAL) {
      console.error('[AlertService] 🔴 CRITICAL:', JSON.stringify(logEntry, null, 2));
    } else if (payload.severity === AlertSeverity.WARNING) {
      console.warn('[AlertService] 🟡 WARNING:', JSON.stringify(logEntry, null, 2));
    } else {
      console.log('[AlertService] 🔵 INFO:', JSON.stringify(logEntry, null, 2));
    }
  }
}

// ============================================================
// 🔌 Export لـ Legacy / CommonJS (اختياري)
// ============================================================

export default AlertService;