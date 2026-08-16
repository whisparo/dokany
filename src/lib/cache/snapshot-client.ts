// src/lib/cache/snapshot-client.ts

import { getStoredSnapshot, saveSnapshot } from './store-cache';

/**
 * 📝 تعريفات الأنواع الشديدة (Strict Types) لبيانات المتجر
 */
export interface StoreData {
  id: string;
  name: string;
  slug: string;
  shopName: string;
  description: string;
  logo: string | null;
  coverImage: string | null;
  country: string | null;
  city: string | null;
  currency: string;
  theme: Record<string, unknown>;
  settings: Record<string, unknown>;
  isActive: boolean;
  isVerified: boolean;
}

export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  order: number;
}

export interface ProductData {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  shortDescription: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  sku: string | null;
  images: string[] | null;
  imageSrc: string | null;
  isFeatured: boolean;
  haggleEnabled: boolean;
  minPrice: number | null;
}

/**
 * هيكل الـ Snapshot الكامل المرتجع من Edge API
 */
export interface SnapshotPayload {
  version: number;
  storeId: string;
  generatedAt: number;
  store: StoreData;
  categories: CategoryData[];
  products: ProductData[];
}

/**
 * جلب الـ Snapshot من الـ Edge CDN أو IndexedDB
 * Stale-While-Revalidate Strategy
 */
export async function fetchStoreSnapshot(
  storeSlug: string,
  options?: { signal?: AbortSignal }
): Promise<{ data: SnapshotPayload; version: number; fromCache: boolean }> {
  // 1. جلب النسخة المخزنة محلياً بالـ slug
  const cached = await getStoredSnapshot<SnapshotPayload>(storeSlug);

  // 2. إذا كانت النسخة موجودة، نرجعها فوراً ونتحقق من التحديثات في الخلفية
  if (cached) {
    checkForUpdateInBackground(storeSlug, cached.version);

    return {
      data: cached.data,
      version: cached.version,
      fromCache: true,
    };
  }

  // 3. لا توجد نسخة مخزنة -> جلب الـ Snapshot كاملاً وخزنه في IndexedDB
  const fresh = await fetchSnapshotFromEdge(storeSlug, options);

  await saveSnapshot(storeSlug, {
    storeId: fresh.storeId,
    version: fresh.version,
    data: fresh,
    timestamp: Date.now(),
  });

  return {
    data: fresh,
    version: fresh.version,
    fromCache: false,
  };
}

/**
 * جلب الـ Snapshot الكامل من الـ Worker API
 */
async function fetchSnapshotFromEdge(
  storeSlug: string,
  options?: { signal?: AbortSignal }
): Promise<SnapshotPayload> {
  const url = `/api/store/${encodeURIComponent(storeSlug)}/snapshot`;
  const res = await fetch(url, {
    signal: options?.signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch store snapshot: ${res.status}`);
  }

  return (await res.json()) as SnapshotPayload;
}

// حماية ضد الاستدعاء المتكرر والمتوازي للـ Version Check
const backgroundCheckLocks = new Set<string>();

/**
 * فحص رقم الإصدار في الخلفية (Light Version Check)
 */
async function checkForUpdateInBackground(storeSlug: string, currentVersion: number): Promise<void> {
  if (backgroundCheckLocks.has(storeSlug)) return;
  backgroundCheckLocks.add(storeSlug);

  setTimeout(async () => {
    try {
      const url = `/api/store/${encodeURIComponent(storeSlug)}/version`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) return;

      const data = (await res.json()) as { version: number; storeId: string };

      if (data.version > currentVersion) {
        const fresh = await fetchSnapshotFromEdge(storeSlug);

        await saveSnapshot(storeSlug, {
          storeId: fresh.storeId,
          version: fresh.version,
          data: fresh,
          timestamp: Date.now(),
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent<SnapshotPayload>('store-snapshot-updated', {
              detail: fresh,
            })
          );
        }
      }
    } catch (error) {
      console.warn('[Snapshot] Background version check skipped:', error);
    } finally {
      backgroundCheckLocks.delete(storeSlug);
    }
  }, 300);
}