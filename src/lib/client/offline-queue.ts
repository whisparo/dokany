// src/lib/client/offline-queue.ts

/**
 * 📦 Offline Queue: إدارة الطلبات المعلقة في وضع الأوفلاين
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getItem,
  setItem,
  removeItem,
} from '@/lib/cache/indexeddb';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

export type OrderStatus = 'pending' | 'synced' | 'failed';

export interface QueuedOrder {
  idempotencyKey: string;
  storeId: string;
  orderId?: string;
  payload: unknown;
  status: OrderStatus;
  attempts: number;
  createdAt: number;
  lastAttemptAt?: number;
  errorMessage?: string;
}

export interface AddOrderOptions {
  force?: boolean;
}

export interface AddOrderResult {
  success: boolean;
  order: QueuedOrder;
  isDuplicate: boolean;
  error?: string;
}

export interface SyncOptions {
  maxBatchSize?: number;
  delayBetweenRequests?: number;
}

export interface SyncResult {
  syncedCount: number;
  failedCount: number;
  failedKeys: string[];
  errors?: Array<{ key: string; error: string }>;
}

// ============================================================
// 🔧 ثوابت
// ============================================================

const QUEUE_STORE_KEY = 'offline_orders';
const MAX_ATTEMPTS = 5;

// ============================================================
// 🔧 دوال مساعدة داخلية
// ============================================================

/**
 * 🎯 إصلاح الـ Operator Precedence لضمان سلامة النوع
 */
function isValidQueuedOrder(order: unknown): order is QueuedOrder {
  if (!order || typeof order !== 'object') return false;
  const o = order as Partial<QueuedOrder>;
  
  const hasValidProps = 
    typeof o.idempotencyKey === 'string' &&
    typeof o.storeId === 'string' &&
    typeof o.payload === 'object' &&
    o.payload !== null;

  const hasValidStatus = 
    o.status === 'pending' || 
    o.status === 'synced' || 
    o.status === 'failed';

  return hasValidProps && hasValidStatus;
}

async function getQueue(): Promise<QueuedOrder[]> {
  const raw = await getItem<QueuedOrder[]>(QUEUE_STORE_KEY);
  if (!raw || !Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isValidQueuedOrder);
}

async function saveQueue(queue: QueuedOrder[]): Promise<void> {
  await setItem(QUEUE_STORE_KEY, queue);
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ============================================================
// 📤 دوال إدارة قائمة الانتظار
// ============================================================

export async function addToQueue(
  order: Omit<QueuedOrder, 'status' | 'attempts' | 'createdAt'>,
  options: AddOrderOptions = {}
): Promise<AddOrderResult> {
  const { force = false } = options;

  const existing = await getQueue();
  const existingOrder = existing.find(
    (o) => o.idempotencyKey === order.idempotencyKey
  );

  if (existingOrder) {
    if (existingOrder.status === 'synced') {
      return {
        success: true,
        order: existingOrder,
        isDuplicate: true,
      };
    }

    const updatedOrder: QueuedOrder = {
      ...existingOrder,
      payload: order.payload,
      attempts: existingOrder.attempts,
    };

    const updatedQueue = existing.map((o) =>
      o.idempotencyKey === order.idempotencyKey ? updatedOrder : o
    );
    await saveQueue(updatedQueue);

    return {
      success: true,
      order: updatedOrder,
      isDuplicate: true,
    };
  }

  const newOrder: QueuedOrder = {
    ...order,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  };

  if (typeof navigator !== 'undefined' && navigator.onLine && !force) {
    try {
      const result = await sendOrderToServer(newOrder);
      if (result.success) {
        newOrder.status = 'synced';
      } else {
        newOrder.status = 'pending';
        newOrder.errorMessage = result.error;
      }
    } catch (error) {
      newOrder.status = 'pending';
      newOrder.errorMessage = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  const updatedQueue = [...existing, newOrder];
  await saveQueue(updatedQueue);

  return {
    success: true,
    order: newOrder,
    isDuplicate: false,
  };
}

export async function updateOrderStatus(
  idempotencyKey: string,
  updates: Partial<Omit<QueuedOrder, 'idempotencyKey'>>
): Promise<boolean> {
  const queue = await getQueue();
  const index = queue.findIndex((o) => o.idempotencyKey === idempotencyKey);
  if (index === -1) return false;

  queue[index] = {
    ...queue[index],
    ...updates,
    lastAttemptAt: Date.now(),
  };

  await saveQueue(queue);
  return true;
}

export async function removeFromQueue(idempotencyKey: string): Promise<boolean> {
  const queue = await getQueue();
  const filtered = queue.filter((o) => o.idempotencyKey !== idempotencyKey);
  if (filtered.length === queue.length) return false;

  await saveQueue(filtered);
  return true;
}

export async function getPendingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter((o) => o.status === 'pending').length;
}

export async function getOrdersByStatus(status: OrderStatus): Promise<QueuedOrder[]> {
  const queue = await getQueue();
  return queue.filter((o) => o.status === status);
}

export async function clearQueue(): Promise<void> {
  await removeItem(QUEUE_STORE_KEY);
}

// ============================================================
// 📤 دالة إرسال الطلب إلى الخادم
// ============================================================

async function sendOrderToServer(
  order: QueuedOrder
): Promise<{ success: boolean; error?: string; orderId?: string }> {
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(order.payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const errorMessage = typeof errorData.message === 'string' 
        ? errorData.message 
        : `Server error: ${response.status}`;

      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = (await response.json()) as { orderId?: string };
    return {
      success: true,
      orderId: data.orderId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================
// 📤 مزامنة قائمة الانتظار مع الخادم
// ============================================================

export async function syncQueue(options: SyncOptions = {}): Promise<SyncResult> {
  const { maxBatchSize = 20, delayBetweenRequests = 500 } = options;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedCount: 0, failedCount: 0, failedKeys: [] };
  }

  const pendingOrders = await getOrdersByStatus('pending');
  if (pendingOrders.length === 0) {
    return { syncedCount: 0, failedCount: 0, failedKeys: [] };
  }

  const batch = pendingOrders.slice(0, maxBatchSize);
  let syncedCount = 0;
  let failedCount = 0;
  const failedKeys: string[] = [];
  const errors: Array<{ key: string; error: string }> = [];

  for (let i = 0; i < batch.length; i++) {
    const order = batch[i];

    try {
      const result = await sendOrderToServer(order);

      if (result.success) {
        await removeFromQueue(order.idempotencyKey);
        syncedCount++;
      } else {
        const newAttempts = order.attempts + 1;
        if (newAttempts >= MAX_ATTEMPTS) {
          await updateOrderStatus(order.idempotencyKey, {
            status: 'failed',
            attempts: newAttempts,
            errorMessage: result.error,
          });
          failedCount++;
          failedKeys.push(order.idempotencyKey);
          errors.push({ key: order.idempotencyKey, error: result.error || 'Unknown error' });
        } else {
          await updateOrderStatus(order.idempotencyKey, {
            attempts: newAttempts,
            errorMessage: result.error,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const newAttempts = order.attempts + 1;
      if (newAttempts >= MAX_ATTEMPTS) {
        await updateOrderStatus(order.idempotencyKey, {
          status: 'failed',
          attempts: newAttempts,
          errorMessage: message,
        });
        failedCount++;
        failedKeys.push(order.idempotencyKey);
        errors.push({ key: order.idempotencyKey, error: message });
      } else {
        await updateOrderStatus(order.idempotencyKey, {
          attempts: newAttempts,
          errorMessage: message,
        });
      }
    }

    if (i < batch.length - 1 && delayBetweenRequests > 0) {
      await delay(delayBetweenRequests);
    }
  }

  return {
    syncedCount,
    failedCount,
    failedKeys,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================================
// 🎣 React Hooks
// ============================================================

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [orders, setOrders] = useState<QueuedOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const loadQueueData = useCallback(async () => {
    try {
      const queue = await getQueue();
      setOrders(queue);
      setPendingCount(queue.filter((o) => o.status === 'pending').length);
    } catch (error) {
      console.warn('[useOfflineQueue] Failed to load queue:', error);
    }
  }, []);

  const sync = useCallback(async (options?: SyncOptions) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    setIsSyncing((syncing) => {
      if (!syncing) {
        (async () => {
          try {
            await syncQueue(options);
            await loadQueueData();
          } finally {
            setIsSyncing(false);
          }
        })();
        return true;
      }
      return true;
    });
  }, [loadQueueData]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      sync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync]);

  useEffect(() => {
    loadQueueData();
    const interval = setInterval(loadQueueData, 30000);
    return () => clearInterval(interval);
  }, [loadQueueData]);

  const addOrder = useCallback(
    async (
      order: Omit<QueuedOrder, 'status' | 'attempts' | 'createdAt'>,
      options?: AddOrderOptions
    ) => {
      const result = await addToQueue(order, options);
      await loadQueueData();
      return result;
    },
    [loadQueueData]
  );

  return {
    pendingCount,
    orders,
    isSyncing,
    isOnline,
    sync,
    addOrder,
    reload: loadQueueData,
  };
}