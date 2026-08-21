// src/lib/cash/useStoreSnapshot.ts

import { useEffect, useState, useCallback } from 'react';
import { fetchStoreSnapshot, SnapshotPayload } from '@/lib/cache/snapshot-client';

export interface UseStoreSnapshotReturn<T = SnapshotPayload> {
  snapshot: { data: T; version: number } | null;
  loading: boolean;
  error: Error | null;
  fromCache: boolean;
  refetch: (signal?: AbortSignal) => Promise<void>;
}

/**
 * Hook لجلب واستخدام Snapshot المتجر مع تحديث تلقائي
 * 
 * الاستراتيجيات:
 * - Cache-First: يرجع البيانات من IndexedDB فوراً (0ms)
 * - Background Update: يفحص الإصدار كل فترة ويجلب التحديثات
 * - Event-Driven: يستمع لحدث 'store-snapshot-updated' لتحديث فوري
 */
export function useStoreSnapshot<T = SnapshotPayload>(
  storeSlug: string
): UseStoreSnapshotReturn<T> {
  const [snapshot, setSnapshot] = useState<{ data: T; version: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState<boolean>(false);

  const loadSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      if (!storeSlug) return;

      try {
        setLoading(true);
        const result = await fetchStoreSnapshot(storeSlug, { signal });
        
        setSnapshot({
          data: result.data as T,
          version: result.version,
        });
        setFromCache(result.fromCache);
        setError(null);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    },
    [storeSlug]
  );

  // التحميل الأولي + الاستماع للتحديثات
  useEffect(() => {
    const abortController = new AbortController();
    loadSnapshot(abortController.signal);

    // الاستماع لتحديثات الخلفية من snapshot-client
    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<SnapshotPayload>;
      const freshData = customEvent.detail;

      // التأكد من أن التحديث يخص المتجر الحالي وقادم ببيانات صحيحة
      if (freshData && freshData.store?.slug === storeSlug) {
        console.log(
          `[useStoreSnapshot] Live updating snapshot for ${storeSlug} to v${freshData.version}`
        );
        
        setSnapshot({
          data: freshData as T,
          version: freshData.version,
        });
        setFromCache(false);
      }
    };

    window.addEventListener('store-snapshot-updated', handleUpdate);

    return () => {
      abortController.abort();
      window.removeEventListener('store-snapshot-updated', handleUpdate);
    };
  }, [storeSlug, loadSnapshot]);

  return {
    snapshot,
    loading,
    error,
    fromCache,
    refetch: loadSnapshot,
  };
}