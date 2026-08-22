// src/core/cron/dlq-handler.ts

/**
 * إدارة الأخطاء وإشعارات Telegram للـ Dead Letter Queue (DLQ)
 * 
 * يقوم هذا الملف بـ:
 *   1. تسجيل الدفعات الفاشلة في جدول dead_letter_batches
 *   2. إرسال تنبيهات فورية للمطورين عبر Telegram عند حدوث أخطاء حرجة
 *   3. توفير دوال للاستعلام عن DLQ وحالة النظام
 *   4. (اختياري) إعادة محاولة معالجة الدفعات الفاشلة
 */

import type { Env } from '@/lib/env';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

/** هيكل سجل DLQ في قاعدة البيانات */
export interface DLQEntry {
  id: string;
  orders_count: number;
  payload: string;
  error_log: string;
  created_at: number;
}

/** مستوى التنبيه (لمرونة الإشعارات) */
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

/** هيكل رسالة التنبيه */
export interface AlertMessage {
  title: string;
  message: string;
  level: AlertLevel;
  metadata?: Record<string, unknown>;
}

// ============================================================
// 🔧 دوال مساعدة داخلية
// ============================================================

/**
 * إرسال رسالة إلى Telegram
 * @param env - بيئة Worker
 * @param message - نص الرسالة (HTML مسموح)
 */
async function sendTelegramMessage(
  env: Env,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('⚠️ Telegram credentials not configured. Skipping alert.');
    return {
      success: false,
      error: 'Telegram credentials missing',
    };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`❌ Telegram API error: ${response.status} - ${responseText}`);
      return {
        success: false,
        error: `Telegram API error: ${response.status}`,
      };
    }

    console.log('✅ Telegram alert sent successfully.');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Telegram error';
    console.error(`❌ Failed to send Telegram message: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * تنسيق رسالة التنبيه إلى HTML (متوافق مع Telegram)
 */
function formatAlertMessage(alert: AlertMessage): string {
  const emojiMap: Record<AlertLevel, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    critical: '🚨',
  };

  const emoji = emojiMap[alert.level] || '📢';
  const timestamp = new Date().toISOString();

  let html = `<b>${emoji} ${alert.title}</b>\n\n`;
  html += `<code>${alert.message}</code>\n\n`;
  html += `<i>${timestamp}</i>`;

  if (alert.metadata && Object.keys(alert.metadata).length > 0) {
    html += '\n\n📦 <b>Metadata:</b>\n';
    for (const [key, value] of Object.entries(alert.metadata)) {
      const safeValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      html += `• <b>${key}:</b> <code>${safeValue}</code>\n`;
    }
  }

  return html;
}

// ============================================================
// 📤 دوال التسجيل في DLQ والتنبيه
// ============================================================

/**
 * تسجيل دفعة فاشلة في DLQ
 * @param env - بيئة Worker
 * @param keys - قائمة مفاتيح KV الخاصة بالدفعة الفاشلة
 * @param errorLog - رسالة الخطأ
 * @param metadata - بيانات إضافية (اختياري)
 */
export async function logToDLQ(
  env: Env,
  keys: string[],
  errorLog: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const id = `dlq_${Date.now()}_${keys.length}`;
    const payload = JSON.stringify({ keys, metadata });

    await env.DB.prepare(
      `INSERT INTO dead_letter_batches (id, orders_count, payload, error_log, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      id,
      keys.length,
      payload,
      errorLog,
      Date.now()
    ).run();

    console.log(`📝 DLQ entry created: ${id} (${keys.length} keys)`);

    return { success: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DLQ error';
    console.error(`❌ Failed to log to DLQ: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * تسجيل الفشل الشامل (تسجيل في DLQ + إرسال تنبيه Telegram)
 * يُستخدم بشكل أساسي في order-archiver.ts
 */
export async function logFailure(
  keys: string[],
  errorLog: string,
  env: Env,
  metadata?: Record<string, unknown>
): Promise<void> {
  // 1️⃣ التسجيل في الـ DLQ
  await logToDLQ(env, keys, errorLog, metadata);

  // 2️⃣ إرسال التنبيه عبر Telegram
  await sendAlert(env, {
    title: keys.length === 0 ? 'Archiver Process Failure' : 'Batch Archiving Failure',
    message: errorLog,
    level: 'critical',
    metadata: {
      keysCount: keys.length,
      sampleKeys: keys.slice(0, 5),
      ...metadata,
    },
  });
}

// ============================================================
// 📤 دوال إرسال التنبيهات (Telegram Alerts)
// ============================================================

/**
 * إرسال تنبيه عبر Telegram
 */
export async function sendAlert(
  env: Env,
  alert: AlertMessage
): Promise<{ success: boolean; error?: string }> {
  const formattedMessage = formatAlertMessage(alert);

  let attempt = 0;
  const MAX_ATTEMPTS = 2;

  while (attempt < MAX_ATTEMPTS) {
    const result = await sendTelegramMessage(env, formattedMessage);
    if (result.success) {
      return { success: true };
    }
    attempt++;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    success: false,
    error: `Failed to send alert after ${MAX_ATTEMPTS} attempts`,
  };
}

/**
 * إرسال تنبيه عند فشل الـ Batch Insert
 */
export async function alertBatchFailure(
  env: Env,
  chunkSize: number,
  errorLog: string,
  keys?: string[]
): Promise<{ success: boolean; error?: string }> {
  const metadata: Record<string, unknown> = {
    chunkSize,
    keysCount: keys?.length || 0,
  };

  if (keys && keys.length > 0 && keys.length <= 10) {
    metadata.sampleKeys = keys.slice(0, 10);
  }

  return sendAlert(env, {
    title: 'Batch Insert Failure',
    message: `Failed to insert ${chunkSize} orders into D1 after all retry attempts.`,
    level: 'error',
    metadata,
  });
}

/**
 * إرسال تنبيه عند فشل عملية الـ List
 */
export async function alertListFailure(
  env: Env,
  errorLog: string,
  prefix?: string
): Promise<{ success: boolean; error?: string }> {
  return sendAlert(env, {
    title: 'KV List Failure',
    message: `Failed to list pending orders from KV after all retry attempts.`,
    level: 'critical',
    metadata: { prefix: prefix || 'pending_order:', errorLog },
  });
}

/**
 * إرسال تنبيه عند فشل الـ Auto Warm-up
 */
export async function alertWarmUpFailure(
  env: Env,
  slug: string,
  errorLog: string,
  component: 'stock' | 'stats' | 'status' | 'snapshot'
): Promise<{ success: boolean; error?: string }> {
  return sendAlert(env, {
    title: `Auto Warm-up Failed: ${component}`,
    message: `Failed to warm up ${component} for store ${slug}.`,
    level: 'warning',
    metadata: { slug, component, errorLog },
  });
}

// ============================================================
// 📤 دوال الاستعلام عن DLQ
// ============================================================

/**
 * جلب جميع سجلات DLQ (للمراقبة)
 */
export async function getDLQEntries(
  env: Env,
  limit: number = 100,
  offset: number = 0
): Promise<{ success: boolean; entries?: DLQEntry[]; error?: string }> {
  try {
    const result = await env.DB.prepare(
      `SELECT * FROM dead_letter_batches 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all<DLQEntry>();

    return {
      success: true,
      entries: result.results || [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown query error';
    console.error(`❌ Failed to fetch DLQ entries: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * الحصول على عدد سجلات DLQ (للـ Dashboard)
 */
export async function getDLQCount(
  env: Env,
  since?: number
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    let query = `SELECT COUNT(*) as count FROM dead_letter_batches`;
    const bindings: unknown[] = [];

    if (since) {
      query += ` WHERE created_at > ?`;
      bindings.push(since);
    }

    const statement = env.DB.prepare(query);
    const result = bindings.length > 0 
      ? await statement.bind(...bindings).first<{ count: number }>()
      : await statement.first<{ count: number }>();

    return {
      success: true,
      count: result?.count || 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown query error';
    console.error(`❌ Failed to get DLQ count: ${message}`);
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// 🔄 دالة إعادة محاولة الدفعات الفاشلة
// ============================================================

/**
 * إعادة محاولة معالجة الدفعات الفاشلة من DLQ
 */
export async function retryDLQBatches(
  env: Env,
  maxEntries: number = 50
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  console.log('🔄 Attempting to retry DLQ batches...');

  try {
    const result = await env.DB.prepare(
      `SELECT * FROM dead_letter_batches 
       ORDER BY created_at ASC 
       LIMIT ?`
    ).bind(maxEntries).all<DLQEntry>();

    if (!result.results || result.results.length === 0) {
      console.log('📭 No DLQ entries to retry.');
      return { processed: 0, errors: [] };
    }

    const entries = result.results;

    for (const entry of entries) {
      try {
        const payload = JSON.parse(entry.payload);
        const keys: string[] = payload.keys || [];

        if (keys.length === 0) {
          await env.DB.prepare(`DELETE FROM dead_letter_batches WHERE id = ?`).bind(entry.id).run();
          console.log(`🗑️ Removed invalid DLQ entry: ${entry.id}`);
          continue;
        }

        await env.DB.prepare(`DELETE FROM dead_letter_batches WHERE id = ?`).bind(entry.id).run();
        processed++;
        console.log(`✅ DLQ entry ${entry.id} processed and removed.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown retry error';
        errors.push(`Failed to retry DLQ entry ${entry.id}: ${message}`);
        console.error(`❌ ${message}`);
      }
    }

    return { processed, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown retry error';
    console.error(`❌ Failed to retry DLQ batches: ${message}`);
    return { processed, errors: [message] };
  }
}

// ============================================================
// 🔥 Auto Warm-up للـ DLQ
// ============================================================

/**
 * تسجيل فشل الـ Warm-up في DLQ
 */
export async function logWarmUpFailure(
  env: Env,
  slug: string,
  component: 'stock' | 'stats' | 'status' | 'snapshot',
  errorLog: string
): Promise<{ success: boolean; error?: string }> {
  return logToDLQ(
    env,
    [`warmup:${slug}:${component}`],
    `Warm-up failed: ${errorLog}`,
    { slug, component }
  );
}