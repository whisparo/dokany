// lib/errors/core/context.ts
// الإصدار: 1.1.1
// الدور: إدارة السياق باستخدام AsyncLocalStorage + Hybrid Context
// المبدأ: منع تسرب السياق بين الطلبات (Cross-request Context Leaks)
// البيئة: Cloudflare Workers مع nodejs_compat

import { AsyncLocalStorage } from 'async_hooks';
import type { ErrorContext } from './types';

export type { ErrorContext };

// ============================================================
// 🔒 AsyncLocalStorage Instance (Private)
// ============================================================

/**
 * تخزين السياق المحلي باستخدام AsyncLocalStorage
 * آمن للاستخدام مع الـ Async/Await ويدعم التزامن
 */
const contextStore = new AsyncLocalStorage<ErrorContext>();

// ============================================================
// 🎯 Core Functions
// ============================================================

/**
 * تشغيل دالة في سياق محدد (تستخدم في Middleware)
 */
export function runWithContext<T>(
  context: ErrorContext,
  fn: () => T
): T {
  return contextStore.run(context, fn);
}

/**
 * الحصول على السياق الحالي
 */
export function getContext(): ErrorContext | undefined {
  return contextStore.getStore();
}

/**
 * الحصول على correlationId من السياق الحالي
 */
export function getCorrelationId(): string | undefined {
  return getContext()?.correlationId;
}

// ============================================================
// 🍞 Breadcrumbs Management
// ============================================================

/**
 * تحويل الكائنات إلى نص بطريقة آمنة من الـ Circular References
 */
function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return '[Unserializable Data]';
  }
}

/**
 * إضافة حدث (Breadcrumb) إلى السياق الحالي
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  const ctx = getContext();
  if (!ctx) return;

  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${safeStringify(data)}` : '';
  const entry = `${timestamp} - ${message}${dataStr}`;

  ctx.breadcrumbs.push(entry);

  if (ctx.breadcrumbs.length > 10) {
    ctx.breadcrumbs.shift();
  }
}

/**
 * إنشاء نسخة جديدة من السياق مع breadcrumb إضافي
 */
export function withBreadcrumb(
  ctx: ErrorContext,
  message: string,
  data?: Record<string, unknown>
): ErrorContext {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${safeStringify(data)}` : '';
  const entry = `${timestamp} - ${message}${dataStr}`;

  const newBreadcrumbs = [...ctx.breadcrumbs, entry];
  if (newBreadcrumbs.length > 10) {
    newBreadcrumbs.shift();
  }

  return {
    ...ctx,
    breadcrumbs: newBreadcrumbs,
  };
}

// ============================================================
// 🔄 Context Updates
// ============================================================

/**
 * تحديث السياق الحالي ببيانات جزئية
 */
export function updateContext(partial: Partial<ErrorContext>): void {
  const ctx = getContext();
  if (!ctx) return;

  Object.assign(ctx, partial);
}

// ============================================================
// 🆕 Context Creation
// ============================================================

/**
 * إنشاء سياق جديد بمعرّف فريد
 */
export function createNewContext(
  overrides: Partial<ErrorContext> = {}
): ErrorContext {
  return {
    correlationId: overrides.correlationId ?? generateCorrelationId(),
    breadcrumbs: overrides.breadcrumbs ?? [],
    startTime: overrides.startTime ?? performance.now(),
    storeId: overrides.storeId,
    userId: overrides.userId,
    path: overrides.path,
    method: overrides.method,
    ip: overrides.ip,
  };
}

/**
 * مسح السياق الحالي بأمان دون تعطيل الـ Store للطلبات الأخرى
 */
export function clearContext(): void {
  const ctx = getContext();
  if (ctx) {
    ctx.breadcrumbs = [];
  }
}

// ============================================================
// 🛡️ Hybrid Context Handler
// ============================================================

export interface ExplicitContext {
  correlationId: string;
  storeId?: string;
  userId?: string;
  path?: string;
  method?: string;
  ip?: string;
  startTime: number;
  breadcrumbs?: string[];
}

/**
 * دمج السياق الصريح مع السياق المحلي
 */
export function mergeContexts(
  explicit: ExplicitContext | undefined,
  local: ErrorContext | undefined
): ErrorContext {
  if (!explicit && !local) {
    return createNewContext();
  }

  const merged: ErrorContext = {
    correlationId: explicit?.correlationId ?? local?.correlationId ?? generateCorrelationId(),
    storeId: explicit?.storeId ?? local?.storeId,
    userId: explicit?.userId ?? local?.userId,
    breadcrumbs: explicit?.breadcrumbs ?? local?.breadcrumbs ?? [],
    startTime: explicit?.startTime ?? local?.startTime ?? performance.now(),
    path: explicit?.path ?? local?.path,
    method: explicit?.method ?? local?.method,
    ip: explicit?.ip ?? local?.ip,
  };

  if (merged.startTime > performance.now()) {
    merged.startTime = performance.now();
  }

  return merged;
}

/**
 * تعيين السياق في مكان واحد مركزي (للاستخدام في Middleware)
 */
export function setupContextForRequest<T>(
  explicitContext: ExplicitContext,
  fn: () => T
): T {
  const fullContext: ErrorContext = {
    correlationId: explicitContext.correlationId,
    storeId: explicitContext.storeId,
    userId: explicitContext.userId,
    breadcrumbs: explicitContext.breadcrumbs ?? [],
    startTime: explicitContext.startTime,
    path: explicitContext.path,
    method: explicitContext.method,
    ip: explicitContext.ip,
  };

  const requestBreadcrumb = `${new Date().toISOString()} - Request started: ${explicitContext.method || 'GET'} ${explicitContext.path || '/'}`;
  fullContext.breadcrumbs.push(requestBreadcrumb);

  return runWithContext(fullContext, fn);
}

// ============================================================
// 🔍 Utility Functions
// ============================================================

export function hasActiveContext(): boolean {
  return getContext() !== undefined;
}

export function getElapsedTime(): number {
  const ctx = getContext();
  if (!ctx) return 0;
  return Math.max(0, performance.now() - ctx.startTime);
}

export function isValidErrorContext(data: unknown): data is ErrorContext {
  if (typeof data !== 'object' || data === null) return false;

  const ctx = data as Record<string, unknown>;

  return (
    typeof ctx.correlationId === 'string' &&
    Array.isArray(ctx.breadcrumbs) &&
    typeof ctx.startTime === 'number'
  );
}

// ============================================================
// 🔒 Private Helpers
// ============================================================

function generateCorrelationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback في حال عدم توفر الموديول
  }
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}