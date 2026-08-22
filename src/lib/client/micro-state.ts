// src/lib/client/micro-state.ts

/**
 * 📊 Micro-State: جلب البيانات الحية (المخزون والأسعار) من Edge KV
 */

import { useState, useEffect, useCallback } from 'react';
import { getMultipleStocks } from '@/lib/cache/edge-stock-cache';
import { getMultiplePrices } from '@/core/live-state/price';
import type { SnapshotPayload } from '@/lib/cache/snapshot-client';
import type { Env } from '@/lib/env';

// ============================================================
// 📦 أنواع البيانات (Types)
// ============================================================

export interface ProductMicroState {
  productId: string;
  stock: number;
  price: number;
  isAvailable: boolean;
}

export interface MicroStateResult {
  data: Map<string, ProductMicroState>;
  fetchedCount: number;
  failedIds: string[];
  fromCache: boolean;
}

export interface MicroStateOptions {
  forceFresh?: boolean;
  signal?: AbortSignal;
  maxBatchSize?: number;
}

interface ApiResponsePayload {
  data?: Record<string, ProductMicroState>;
}

// ============================================================
// 🔧 دوال مساعدة داخلية (Helpers)
// ============================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function getMicroStateCacheKey(storeSlug: string, productIds: string[]): string {
  const sorted = [...productIds].sort().join('|');
  return `microstate_${storeSlug}_${sorted}`;
}

/**
 * 🎯 استخراج السعر أو المخزون بآمان تام سواء كان الـ Source عبارة عن Map أو Object
 */
function extractNumericValue(
  source: Map<string, number> | Record<string, number> | undefined | null,
  key: string
): number {
  if (!source) return 0;
  if (source instanceof Map) {
    return source.get(key) ?? 0;
  }
  return source[key] ?? 0;
}

// ============================================================
// ⚙️ 1. دوال الخادم (Edge / Server Functions)
// ============================================================

/**
 * جلب البيانات الحية (المخزون + الأسعار) من Edge KV
 */
export async function fetchMicroState(
  storeSlug: string,
  storeId: string,
  productIds: string[],
  env: Env,
  options: MicroStateOptions = {}
): Promise<MicroStateResult> {
  const { signal, maxBatchSize = 50 } = options;

  if (productIds.length === 0) {
    return {
      data: new Map(),
      fetchedCount: 0,
      failedIds: [],
      fromCache: false,
    };
  }

  const batches = chunkArray(productIds, maxBatchSize);
  const results: ProductMicroState[] = [];
  const failedIds: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (signal?.aborted) throw new Error('Request aborted');

    try {
      // 🚀 استغلال Bulk APIs
      const [stocksMap, pricesMap] = await Promise.all([
        getMultipleStocks(env, storeId, batch),
        getMultiplePrices(storeSlug, batch, env),
      ]);

      for (const productId of batch) {
        // 🎯 استخراج قيم الـ Map/Record بدون Type Error
        const stock = extractNumericValue(stocksMap, productId);
        const price = extractNumericValue(pricesMap, productId);

        results.push({
          productId,
          stock,
          price,
          isAvailable: stock > 0,
        });
      }
    } catch (error) {
      console.warn(`⚠️ [MicroState] Batch ${i + 1}/${batches.length} failed:`, error);
      failedIds.push(...batch);
    }
  }

  const dataMap = new Map<string, ProductMicroState>();
  for (const item of results) {
    dataMap.set(item.productId, item);
  }

  return {
    data: dataMap,
    fetchedCount: results.length,
    failedIds,
    fromCache: false,
  };
}

/**
 * دمج البيانات الحية مع الـ Snapshot
 */
export async function mergeMicroStateWithSnapshot(
  storeSlug: string,
  storeId: string,
  snapshot: SnapshotPayload,
  env: Env,
  options: MicroStateOptions = {}
): Promise<Array<{ product: SnapshotPayload['products'][0]; microState: ProductMicroState }>> {
  const productIds = snapshot.products.map((p) => p.id);
  if (productIds.length === 0) return [];

  const microStateResult = await fetchMicroState(storeSlug, storeId, productIds, env, options);

  return snapshot.products.map((product) => ({
    product,
    microState: microStateResult.data.get(product.id) || {
      productId: product.id,
      stock: 0,
      price: product.price,
      isAvailable: false,
    },
  }));
}

/**
 * جلب البيانات الحية فقط
 */
export async function fetchLiveDataOnly(
  storeSlug: string,
  storeId: string,
  productIds: string[],
  env: Env,
  options: MicroStateOptions = {}
): Promise<Map<string, ProductMicroState>> {
  const result = await fetchMicroState(storeSlug, storeId, productIds, env, options);
  return result.data;
}

// ============================================================
// 🎣 2. جزء الـ Client (React Hook + Client Caching)
// ============================================================

/**
 * React Hook لاستخدام الـ MicroState في الواجهات
 */
export function useMicroState(
  storeSlug: string,
  storeId: string,
  productIds: string[]
) {
  const productIdsKey = productIds.slice().sort().join(',');

  const [state, setState] = useState<{
    data: Map<string, ProductMicroState> | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    const ids = productIdsKey ? productIdsKey.split(',') : [];

    if (ids.length === 0) {
      setState({ data: new Map(), loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // 1️⃣ محاولة القراءة من IndexedDB مؤقتاً
      const { getItem, setItem } = await import('@/lib/cache/indexeddb');
      const cacheKey = getMicroStateCacheKey(storeSlug, ids);
      const cached = await getItem<{ data: ProductMicroState[]; timestamp: number }>(cacheKey);

      if (cached && Date.now() - cached.timestamp < 30000) {
        const cachedMap = new Map(cached.data.map((item) => [item.productId, item]));
        setState({ data: cachedMap, loading: false, error: null });
        return;
      }

      // 2️⃣ طلب البيانات من API
      const response = await fetch(`/api/stores/${storeSlug}/micro-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productIds: ids }),
      });

      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);

      // 🎯 Type Assertion آمن للـ Unknown Response
      const result = (await response.json()) as ApiResponsePayload;
      const rawData = result.data ?? {};
      const resultMap = new Map<string, ProductMicroState>(Object.entries(rawData));

      // 3️⃣ حفظ في IndexedDB
      await setItem(cacheKey, {
        data: Array.from(resultMap.values()),
        timestamp: Date.now(),
      });

      setState({ data: resultMap, loading: false, error: null });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      setState({ data: null, loading: false, error: err });
    }
  }, [storeSlug, storeId, productIdsKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch: fetchData,
  };
}