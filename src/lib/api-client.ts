// src/lib/api-client.ts

import { SystemError } from '@/lib/errors';

type NextFetchRequestConfig = NonNullable<RequestInit['next']>;

// ============================================================
// 📌 الأنواع (Types)
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: string;
    correlationId?: string;
    path?: string;
  };
}

export interface ApiClientOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeadersInit;
  retries?: number;
  baseDelay?: number;
  skipRetryOn?: number[];
  withAuth?: boolean;
  token?: string; // للسماح بتمرير التوكن يدوياً (مفيد للـ SSR)
  idempotencyKey?: string;
  correlationId?: string; // ✅ دعم تمرير correlationId صريح
  timeout?: number;
  next?: NextFetchRequestConfig;
}

// ============================================================
// 🧩 الوظائف الأساسية
// ============================================================

/**
 * إنشاء رؤوس الطلب الأساسية مع تتبع الـ Correlation ID
 */
function getDefaultHeaders(options?: ApiClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };

  // ✅ 1. حقن الـ Correlation ID الموحد للتتبع في كامل المنظومة
  const correlationId = 
    options?.correlationId || 
    (typeof window !== 'undefined' ? (window as unknown as { __CORRELATION_ID__?: string }).__CORRELATION_ID__ : undefined) ||
    crypto.randomUUID();
  
  headers['x-correlation-id'] = correlationId;

  // ✅ 2. إضافة المصادقة
  if (options?.withAuth !== false) {
    const token = options?.token || 
      (typeof window !== 'undefined' ? localStorage?.getItem('auth_token') : null);
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // ✅ 3. إضافة Idempotency Key
  if (options?.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey;
  }

  return headers;
}

/**
 * 🔄 إعادة المحاولة مع تأخير تصاعدي (Exponential Backoff) وتتبع الأخطاء
 */
async function fetchWithRetry<T>(
  url: string,
  options: ApiClientOptions = {},
  attempt: number = 1
): Promise<ApiResponse<T>> {
  const {
    retries = 3,
    baseDelay = 300,
    skipRetryOn = [400, 401, 403, 404],
    timeout = 30000,
    method = 'GET',
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const defaultHeaders = getDefaultHeaders(options);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      method,
      headers: {
        ...defaultHeaders,
        ...(fetchOptions.headers as Record<string, string>),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: unknown;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text();
    }

    // استخراج correlationId من استجابة السيرفر إذا وُجد
    const serverCorrelationId = response.headers.get('x-correlation-id') || defaultHeaders['x-correlation-id'];

    if (response.ok) {
      if (data && typeof data === 'object' && 'success' in data) {
        return data as ApiResponse<T>;
      }
      return {
        success: true,
        data: data as T,
        metadata: { 
          timestamp: new Date().toISOString(), 
          path: url,
          correlationId: serverCorrelationId 
        },
      };
    }

    const errorData = data as ApiResponse<T>;

    if (skipRetryOn.includes(response.status) || attempt >= retries) {
      return {
        success: false,
        error: {
          code: errorData?.error?.code || `HTTP_${response.status}`,
          message: errorData?.error?.message || `HTTP Error ${response.status}`,
          details: errorData?.error?.details || data,
        },
        metadata: { 
          timestamp: new Date().toISOString(), 
          path: url,
          correlationId: serverCorrelationId
        },
      };
    }

    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 5000);
    await new Promise((resolve) => setTimeout(resolve, delay));

    return fetchWithRetry<T>(url, options, attempt + 1);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        success: false,
        error: { code: 'TIMEOUT', message: `Request timeout after ${timeout}ms` },
        metadata: { 
          timestamp: new Date().toISOString(), 
          path: url,
          correlationId: defaultHeaders['x-correlation-id']
        },
      };
    }

    if (attempt < retries) {
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry<T>(url, options, attempt + 1);
    }

    // ✅ تحويل الخطأ إلى SystemError متوافق مع نظامك الموحد
    const isSysErr = error instanceof SystemError;
    const errorCode = isSysErr ? error.code : 'NETWORK_ERROR';
    const errorMessage = isSysErr ? error.userMessage : (error instanceof Error ? error.message : 'Network request failed');

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: error,
      },
      metadata: { 
        timestamp: new Date().toISOString(), 
        path: url,
        correlationId: defaultHeaders['x-correlation-id']
      },
    };
  }
}

/**
 * دالة مساعدة مع تثبيت الـ Idempotency Key للطلبات المعدلة
 */
async function requestWithMutation<T>(
  path: string, 
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', 
  body?: unknown, 
  options?: ApiClientOptions
): Promise<ApiResponse<T>> {
  const isJsonBody = body && !(body instanceof FormData);
  
  const finalOptions: ApiClientOptions = {
    ...options,
    method,
    // ✅ تثبيت المفتاح قبل الدخول في الـ Retry Loop
    idempotencyKey: options?.idempotencyKey || crypto.randomUUID(),
    headers: {
      ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers as Record<string, string>),
    },
    body: isJsonBody ? JSON.stringify(body) : (body as BodyInit),
  };

  return fetchWithRetry<T>(resolveUrl(path), finalOptions);
}

// ============================================================
// 📤 الدوال المكشوفة للاستخدام
// ============================================================

const resolveUrl = (path: string) => {
  if (path.startsWith('http')) return path;
  const baseUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_URL : '';
  return baseUrl ? `${baseUrl}${path}` : path;
};

export async function getApi<T = unknown>(path: string, options?: ApiClientOptions) {
  return fetchWithRetry<T>(resolveUrl(path), { ...options, method: 'GET' });
}

export async function postApi<T = unknown>(path: string, body?: unknown, options?: ApiClientOptions) {
  return requestWithMutation<T>(path, 'POST', body, options);
}

export async function putApi<T = unknown>(path: string, body?: unknown, options?: ApiClientOptions) {
  return requestWithMutation<T>(path, 'PUT', body, options);
}

export async function patchApi<T = unknown>(path: string, body?: unknown, options?: ApiClientOptions) {
  return requestWithMutation<T>(path, 'PATCH', body, options);
}

export async function deleteApi<T = unknown>(path: string, options?: ApiClientOptions) {
  return fetchWithRetry<T>(resolveUrl(path), { ...options, method: 'DELETE' });
}

export async function uploadFile<T = unknown>(
  path: string,
  file: File | Blob,
  additionalData?: Record<string, string>,
  options?: ApiClientOptions
): Promise<ApiResponse<T>> {
  const formData = new FormData();
  formData.append('file', file);

  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  return requestWithMutation<T>(path, 'POST', formData, options);
}

// ============================================================
// 🧰 دوال مساعدة لـ Next.js (Server Components)
// ============================================================

export async function fetchWithRevalidation<T = unknown>(path: string, tags?: string[], revalidate?: number) {
  return getApi<T>(path, { next: { tags, revalidate: revalidate || 60 } });
}

export async function fetchDynamic<T = unknown>(path: string, options?: ApiClientOptions) {
  return getApi<T>(path, { ...options, cache: 'no-store' });
}

export async function fetchStatic<T = unknown>(path: string, options?: ApiClientOptions) {
  return getApi<T>(path, { ...options, cache: 'force-cache' });
}

// ============================================================
// 🛠️ دوال مساعدة لـ Server Actions
// ============================================================

export async function executeServerAction<T, P>(
  action: (payload: P) => Promise<ApiResponse<T>>,
  payload: P
): Promise<ApiResponse<T>> {
  try {
    return await action(payload);
  } catch (error) {
    const isSysErr = error instanceof SystemError;
    const errorCode = isSysErr ? error.code : 'ACTION_FAILED';
    const errorMessage = isSysErr ? error.userMessage : (error instanceof Error ? error.message : 'Action execution failed');

    return {
      success: false,
      error: { code: errorCode, message: errorMessage },
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export const __testing = { getDefaultHeaders, fetchWithRetry, resolveUrl };
export type { ApiResponse as ApiResponseType };