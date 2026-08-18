// src/lib/alerts/alert-service.ts

import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from '@/lib/env';
import { ChannelRegistry } from './channels';
import type {
  AlertDispatchResult,
  AlertEvent,
  AlertEventType,
  AlertPayloadMap,
  AlertSeverity,
  CompensationPayload,
  CriticalFailurePayload,
  FallbackPayload,
  LowStockPayload,
  SystemAnnouncementPayload,
} from './types';

export interface DispatchObjectOptions<T extends AlertEventType = AlertEventType> {
  type: T;
  severity: AlertSeverity;
  payload: AlertPayloadMap[T];
  correlationId?: string;
}

/**
 * ⚡ AlertService
 * العقل الموجه لنظام التنبيهات مع محرك منع التكرار (Deduplication Engine)
 */
export class AlertService {
  private static instance: AlertService;
  private registry: ChannelRegistry;
  
  // 🧠 In-Memory Deduplication Cache (Key -> Expiration Timestamp)
  private dedupeCache: Map<string, number> = new Map();
  private readonly DEFAULT_DEDUPE_TTL_MS = 60_000; // نافذة دقيقة واحدة تمنع التكرار

  private constructor() {
    this.registry = new ChannelRegistry();
  }

  /**
   * Singleton Instance للحفاظ على الـ Dedupe Cache عبر الـ Isolate
   */
  public static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  /**
   * Overload 1: الإرسال عبر Object موحد
   */
  public async dispatch<T extends AlertEventType>(
    options: DispatchObjectOptions<T>,
    env: Env,
    ctx?: ExecutionContext
  ): Promise<AlertDispatchResult | null>;

  /**
   * Overload 2: الإرسال عبر البرامترات المنفصلة
   */
  public async dispatch<T extends AlertEventType>(
    type: T,
    severity: AlertSeverity,
    payload: AlertPayloadMap[T],
    env: Env,
    ctx?: ExecutionContext,
    correlationId?: string
  ): Promise<AlertDispatchResult | null>;

  /**
   * Implementation
   */
  public async dispatch<T extends AlertEventType>(
    arg1: T | DispatchObjectOptions<T>,
    arg2: AlertSeverity | Env,
    arg3?: AlertPayloadMap[T] | ExecutionContext,
    arg4?: Env,
    arg5?: ExecutionContext,
    arg6?: string
  ): Promise<AlertDispatchResult | null> {
    let type: T;
    let severity: AlertSeverity;
    let payload: AlertPayloadMap[T];
    let env: Env;
    let ctx: ExecutionContext | undefined;
    let correlationId: string | undefined;

    // التمييز بين الـ Object Call والـ Positional Call
    if (typeof arg1 === 'object' && arg1 !== null && 'type' in arg1) {
      type = arg1.type;
      severity = arg1.severity;
      payload = arg1.payload;
      correlationId = arg1.correlationId;
      env = arg2 as Env;
      ctx = arg3 as ExecutionContext | undefined;
    } else {
      type = arg1 as T;
      severity = arg2 as AlertSeverity;
      payload = arg3 as AlertPayloadMap[T];
      env = arg4 as Env;
      ctx = arg5;
      correlationId = arg6;
    }

    const eventId = crypto.randomUUID();

    // 1. فحص التكرار (Deduplication Check)
    if (this.isDuplicate(type, severity, payload)) {
      console.info(`🔄 [AlertService] Duplicate alert suppressed for event: [${type}]`);
      return null;
    }

    // 2. بناء حدث التنبيه الموحد
    const event: AlertEvent<T> = {
      id: eventId,
      type,
      severity,
      timestamp: Date.now(),
      payload,
      correlationId,
    };

    // 3. تطبيق Severity Routing Matrix لتحديد القنوات المستهدفة
    const targetChannels = this.resolveTargetChannels(severity, type);

    // 4. التنفيذ بأسلوب Non-Blocking باستخدام waitUntil إن وجد
    const dispatchTask = async (): Promise<AlertDispatchResult> => {
      const results = await this.registry.dispatch(event, env, targetChannels);
      const delivered = results.some((r) => r.success);

      return {
        eventId,
        delivered,
        results,
      };
    };

    if (ctx?.waitUntil) {
      // Fire-and-Forget: إرسال المهمة للـ Event Loop بتاع Worker
      ctx.waitUntil(dispatchTask());
      return {
        eventId,
        delivered: true, // افتراض التسليم للـ Background Task
        results: [],
      };
    }

    // لو مفيش ExecutionContext (زي الاختبارات) ننتظر النتيجة
    return await dispatchTask();
  }

  /**
   * 🔍 خوارزمية فحص منع التكرار (Deduplication Engine)
   */
  private isDuplicate<T extends AlertEventType>(
    type: T,
    severity: AlertSeverity,
    payload: AlertPayloadMap[T]
  ): boolean {
    // الأحداث الحرجة CRITICAL لا يتم منعها أبداً لضمان وصول التنبيه فوراً
    if (severity === 'CRITICAL') {
      return false;
    }

    // بناء المفتاح المركب
    const dedupeKey = this.generateDedupeKey(type, payload);
    if (!dedupeKey) return false;

    const now = Date.now();
    const expiresAt = this.dedupeCache.get(dedupeKey);

    if (expiresAt && expiresAt > now) {
      return true; // مكرر داخل النافذة الزمنية
    }

    // نظافة الـ Memory: مسح المفاتيح المنتهية لو الكاش كبر
    if (this.dedupeCache.size > 500) {
      this.cleanExpiredCache(now);
    }

    // تسجيل المفتاح بالـ TTL
    this.dedupeCache.set(dedupeKey, now + this.DEFAULT_DEDUPE_TTL_MS);
    return false;
  }

  /**
   * توليد المفتاح الفريد لمنع التكرار بناءً على نوع الحدث والبيانات
   */
  private generateDedupeKey<T extends AlertEventType>(
    type: T,
    payload: AlertPayloadMap[T]
  ): string | null {
    switch (type) {
      case 'LOW_STOCK': {
        const p = payload as LowStockPayload;
        return `dedupe:${type}:${p.storeId}:${p.productId}`;
      }
      case 'FALLBACK_ACTIVATED': {
        const p = payload as FallbackPayload;
        return `dedupe:${type}:${p.storeId}:${p.operation}`;
      }
      case 'COMPENSATION_EXECUTED': {
        const p = payload as CompensationPayload;
        return `dedupe:${type}:${p.storeId}:${p.reason}`;
      }
      case 'CRITICAL_FAILURE': {
        const p = payload as CriticalFailurePayload;
        return `dedupe:${type}:${p.storeId}:${p.action}`;
      }
      case 'SYSTEM_ANNOUNCEMENT': {
        const p = payload as SystemAnnouncementPayload;
        return `dedupe:${type}:${p.title}`;
      }
      default:
        return null;
    }
  }

  /**
   * تنظيف الـ Cache من العناصر المنتهية
   */
  private cleanExpiredCache(now: number): void {
    for (const [key, expiresAt] of this.dedupeCache.entries()) {
      if (expiresAt <= now) {
        this.dedupeCache.delete(key);
      }
    }
  }

  /**
   * 🎯 تحديد القنوات المستهدفة حسب مستوى الخطورة ونوع الحدث
   */
  private resolveTargetChannels(severity: AlertSeverity, type: AlertEventType): string[] {
    // 🔴 1. الأخطاء التقنية والـ CRITICAL تذهب لقناة أخطاء التليجرام + الـ Logger
    if (severity === 'CRITICAL' || type === 'CRITICAL_FAILURE') {
      return ['telegram-errors', 'logger'];
    }

    // 🟢 2. التنبيهات التجارية (NEW_ORDER, LOW_STOCK, WARNING, INFO) تذهب لقناة التجارة + الـ Logger
    if (severity === 'WARNING' || type === 'NEW_ORDER' || type === 'LOW_STOCK') {
      return ['telegram-business', 'logger'];
    }

    // 📄 3. باقي الإشعارات العادية تذهب لسجلات النظام
    return ['logger'];
  }
}

// Export Singleton Helper Function
export const alertService = AlertService.getInstance();