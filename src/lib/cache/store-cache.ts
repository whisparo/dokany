// src/lib/cache/store-cache.ts

import { getItem, setItem, removeItem } from './indexeddb';

/**
 * هيكل البيانات المخزنة في IndexedDB
 */
export interface StoredSnapshot<T = unknown> {
  storeId: string;
  version: number;          // رقم الإصدار المتزايد
  data: T;                  // البيانات النصية (JSON)
  timestamp: number;        // وقت التخزين (milliseconds)
}

/**
 * توليد مفتاح موحد ديناميكي لكل متجر لمنع تداخل بيانات المتاجر المختلفة
 */
function getSnapshotKey(storeSlugOrId: string): string {
  return `store_snapshot_${storeSlugOrId}`;
}

/**
 * استرجاع الـ Snapshot المخزن محلياً لمتجر معين
 */
export async function getStoredSnapshot<T = unknown>(
  storeSlugOrId: string
): Promise<StoredSnapshot<T> | null> {
  return getItem<StoredSnapshot<T>>(getSnapshotKey(storeSlugOrId));
}

/**
 * تخزين Snapshot جديد لمتجر معين (يستبدل القديم لنفس المتجر تلقائياً)
 */
export async function saveSnapshot<T = unknown>(
  storeSlugOrId: string,
  snapshot: StoredSnapshot<T>
): Promise<void> {
  await setItem(getSnapshotKey(storeSlugOrId), snapshot);
}

/**
 * حذف الـ Snapshot لمتجر معين
 */
export async function clearSnapshot(storeSlugOrId: string): Promise<void> {
  await removeItem(getSnapshotKey(storeSlugOrId));
}

/**
 * التحقق مما إذا كان الـ Snapshot المخزن حديثاً
 */
export function isSnapshotFresh(
  snapshot: StoredSnapshot,
  maxAgeSeconds: number = 60
): boolean {
  const now = Date.now();
  const ageSeconds = (now - snapshot.timestamp) / 1000;
  return ageSeconds < maxAgeSeconds;
}