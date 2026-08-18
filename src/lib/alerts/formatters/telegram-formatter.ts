// src/lib/alerts/formatters/telegram-formatter.ts

import type { AlertEvent, AlertEventType, AlertPayloadMap } from '../types';

/**
 * 🛠️ تنظيف النصوص لمنع كسر تاقات HTML في Telegram API
 */
function escapeHtml(text: string | number): string {
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 🎨 Telegram Message Formatter (HTML Parse Mode)
 */
export class TelegramFormatter {
  
  /**
   * الدالة الرئيسية لتحويل الحدث لرسالة HTML منسقة
   */
  static format<T extends AlertEventType>(event: AlertEvent<T>): string {
    const time = new Date(event.timestamp).toISOString().replace('T', ' ').substring(0, 19);
    const header = this.getHeader(event.severity, event.type);
    const body = this.getBody(event.type, event.payload);
    const footer = `\n\n🕒 <b>الوقت:</b> <code>${time}</code>\n🆔 <b>Correlation:</b> <code>${escapeHtml(event.correlationId || event.id)}</code>`;

    return `${header}\n\n${body}${footer}`;
  }

  private static getHeader(severity: string, type: string): string {
    const severityBadges: Record<string, string> = {
      CRITICAL: '🚨 <b>[حرج جداً - CRITICAL]</b>',
      WARNING: '⚠️ <b>[تحذير - WARNING]</b>',
      INFO: 'ℹ️ <b>[تنبيه - INFO]</b>',
    };

    const badge = severityBadges[severity] || '📢 <b>[تنبيه]</b>';
    return `${badge}\n🏷️ <b>الحدث:</b> <code>${escapeHtml(type)}</code>`;
  }

  private static getBody<T extends AlertEventType>(type: T, payload: AlertPayloadMap[T]): string {
    switch (type) {
      case 'NEW_ORDER': {
        const p = payload as AlertPayloadMap['NEW_ORDER'];
        const formattedTotal = (p.totalAmount / 100).toFixed(2);
        return [
          `🛍️ <b>طلب جديد تم استلامه</b>`,
          `🏪 <b>المتجر:</b> <code>${escapeHtml(p.storeId)}</code>`,
          `🧾 <b>رقم الطلب:</b> <code>${escapeHtml(p.orderId)}</code>`,
          `👤 <b>العميل:</b> <b>${escapeHtml(p.customerName)}</b>`,
          `📦 <b>عدد المنتجات:</b> <code>${p.itemsCount}</code>`,
          `💰 <b>الإجمالي:</b> <b>${formattedTotal} ${escapeHtml(p.currency)}</b>`,
          `🎉 <b>إجراء:</b> يرجى تجهيز الطلب للشحن.`
        ].join('\n');
      }

      case 'LOW_STOCK': {
        const p = payload as AlertPayloadMap['LOW_STOCK'];
        return [
          `🏪 <b>المتجر:</b> <code>${escapeHtml(p.storeId)}</code>`,
          `📦 <b>المنتج:</b> <b>${escapeHtml(p.productName)}</b> (<code>${escapeHtml(p.productId)}</code>)`,
          `📉 <b>المخزون المتبقي:</b> <code>${p.currentStock}</code> (الحد الأدنى: <code>${p.threshold}</code>)`,
          `⚠️ <b>إجراء مطلوب:</b> يُرجى إعادة تزويد المخزون فوراً.`
        ].join('\n');
      }

      case 'FALLBACK_ACTIVATED': {
        const p = payload as AlertPayloadMap['FALLBACK_ACTIVATED'];
        return [
          `🏪 <b>المتجر:</b> <code>${escapeHtml(p.storeId)}</code>`,
          `⚙️ <b>العملية:</b> <code>${escapeHtml(p.operation)}</code>`,
          `⚡ <b>الحالة:</b> تم التفعيل التلقائي لـ D1 Fallback`,
          `📝 <b>السبب:</b> <code>${escapeHtml(p.reason)}</code>`,
          p.durationMs ? `⏱️ <b>الزمن:</b> <code>${p.durationMs}ms</code>` : ''
        ].filter(Boolean).join('\n');
      }

      case 'COMPENSATION_EXECUTED': {
        const p = payload as AlertPayloadMap['COMPENSATION_EXECUTED'];
        return [
          `🏪 <b>المتجر:</b> <code>${escapeHtml(p.storeId)}</code>`,
          p.orderId ? `🧾 <b>الطلب:</b> <code>${escapeHtml(p.orderId)}</code>` : '',
          `🔄 <b>القطع المعوضة:</b> <code>${p.itemsCount}</code>`,
          `📝 <b>السبب:</b> <code>${escapeHtml(p.reason)}</code>`
        ].filter(Boolean).join('\n');
      }

      case 'CRITICAL_FAILURE': {
        const p = payload as AlertPayloadMap['CRITICAL_FAILURE'];
        return [
          `🏪 <b>المتجر:</b> <code>${escapeHtml(p.storeId)}</code>`,
          `💥 <b>الإجراء الفاشل:</b> <code>${escapeHtml(p.action)}</code>`,
          `❌ <b>الخطأ:</b> <code>${escapeHtml(p.error)}</code>`,
          p.stack ? `📜 <b>الـ Stack:</b>\n<pre>${escapeHtml(p.stack.slice(0, 300))}</pre>` : ''
        ].filter(Boolean).join('\n');
      }

      case 'SYSTEM_ANNOUNCEMENT': {
        const p = payload as AlertPayloadMap['SYSTEM_ANNOUNCEMENT'];
        return [
          `📢 <b>${escapeHtml(p.title)}</b>`,
          `\n${escapeHtml(p.message)}`,
          p.actionUrl ? `\n🔗 <a href="${p.actionUrl}">عرض التفاصيل</a>` : ''
        ].filter(Boolean).join('\n');
      }

      default:
        return `📄 <b>التفاصيل:</b>\n<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
    }
  }
}