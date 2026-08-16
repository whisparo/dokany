// src/lib/cache/indexeddb.ts

/**
 * ✅ Wrapper آمن وسريع لـ IndexedDB
 * يستخدم مفتاحاً واحداً لتخزين البيانات بدون مكتبات خارجية
 * متضمن آلية Timeout لحماية واجهة العميل عند تعليق الـ IDB Engine
 */

const DB_NAME = 'dokany-store-cache';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

/**
 * تخزين قيمة تحت مفتاح معين
 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to set item in IndexedDB:', error);
  }
}

/**
 * استرجاع قيمة تحت مفتاح معين مع حماية الـ Timeout (ترجع null عند الفشل أو انتهاء الوقت)
 */
export async function getItem<T>(key: string, timeoutMs = 1000): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      const timeout = setTimeout(() => {
        console.warn(`IndexedDB read timeout for key: ${key}`);
        resolve(null); // Return null instead of crashing, falling back to network
      }, timeoutMs);

      request.onsuccess = () => {
        clearTimeout(timeout);
        const result = request.result as { key: string; value: T } | undefined;
        resolve(result?.value ?? null);
      };

      request.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };
    });
  } catch (error) {
    console.warn('Failed to read from IndexedDB:', error);
    return null;
  }
}

/**
 * حذف مفتاح معين
 */
export async function removeItem(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to remove item from IndexedDB:', error);
  }
}

/**
 * مسح التخزين بالكامل
 */
export async function clearStore(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to clear IndexedDB:', error);
  }
}