// src/lib/alerts/types.ts

import type { Env } from '@/lib/env';

/**
 * 🚨 ALERT SYSTEM TYPES & CONTRACTS
 * نظام التنبيهات المركزي لمشروع "دكاني"
 */

// 1. مستويات الخطورة (Severity Levels)
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

// 2. أسماء القنوات المدعومة (حالياً ومستقبلياً)
export type AlertChannelType = 
  | 'telegram' 
  | 'telegram-business' 
  | 'telegram-errors' 
  | 'logger' 
  | 'discord' 
  | 'in_app';

// 3. أنواع الأحداث المتاحة في النظام (Business & Infrastructure Events)
export type AlertEventType = 
  | 'LOW_STOCK'            // مخزون وشك على النفاد (<= 5)
  | 'NEW_ORDER'            // طلب جديد تم استلامه
  | 'FALLBACK_ACTIVATED'    // Redis عطلان والسيستم حوّل على D1
  | 'COMPENSATION_EXECUTED' // تم تعويض المخزون بنجاح بعد فشل عملية
  | 'CRITICAL_FAILURE'      // فشل تعويض المخزون أو خطأ كارثي
  | 'SYSTEM_ANNOUNCEMENT';  // إشعارات وتحديثات المنصة العامة

// 4. الـ Payloads الخاصة لكل حدث

export interface LowStockPayload {
  storeId: string;
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
}

export interface NewOrderPayload {
  storeId: string;
  orderId: string;
  customerName: string;
  totalAmount: number; // المبلغ بالسنتمات/القروش كـ integer لمنع أخطاء التقريب
  currency: string;    // e.g., "EGP"
  itemsCount: number;
}

export interface FallbackPayload {
  storeId: string;
  operation: string; // e.g., "reserveStockAtomic"
  reason: string;
  durationMs?: number;
}

export interface CompensationPayload {
  storeId: string;
  orderId?: string;
  itemsCount: number;
  reason: string;
}

export interface CriticalFailurePayload {
  storeId: string;
  action: string;
  error: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemAnnouncementPayload {
  title: string;
  message: string;
  targetStores?: string[];
  actionUrl?: string;
}

// Map يربط نوع الحدث بالـ Payload الخاص بيه
export type AlertPayloadMap = {
  LOW_STOCK: LowStockPayload;
  NEW_ORDER: NewOrderPayload;
  FALLBACK_ACTIVATED: FallbackPayload;
  COMPENSATION_EXECUTED: CompensationPayload;
  CRITICAL_FAILURE: CriticalFailurePayload;
  SYSTEM_ANNOUNCEMENT: SystemAnnouncementPayload;
};

// 5. الهيكل الموحد لأي حدث تنبيه (Unified Alert Event)
export interface AlertEvent<T extends AlertEventType = AlertEventType> {
  id: string;                  // UUID فريد للحدث
  type: T;
  severity: AlertSeverity;
  timestamp: number;          // Unix epoch timestamp
  payload: AlertPayloadMap[T];
  correlationId?: string;     // لتتبع Request عبر الخدمات
}

// 6. عقد قناة الإرسال (Channel Contract)
export interface IAlertChannel {
  name: AlertChannelType;
  /**
   * دالة الإرسال الخاصة بالقناة
   * تقبل الـ env للوصول لمتغيرات البيئة مثل TELEGRAM_BOT_TOKEN
   */
  send<T extends AlertEventType>(event: AlertEvent<T>, env: Env): Promise<boolean>;
}

// 7. نتائج التوزيع
export interface ChannelResult {
  channel: AlertChannelType;
  success: boolean;
  error?: string;
}

export interface AlertDispatchResult {
  eventId: string;
  delivered: boolean;
  results: ChannelResult[];
}