// src/lib/client/bootstrapper.ts

/**
 * 🚀 Client Bootstrapper: تحميل وتهيئة Snapshot المتجر من IndexedDB أو Edge
 *
 * هذا الملف هو الطبقة المشتركة (Shared Client Layer) التي تستخدمها:
 *   - Storefront (عرض المنتجات والأقسام)
 *   - Analytics (تحميل ملفات Parquet / JSON Rollups)
 *   - Theme / Design (تحميل Design Tokens)
 *   - أي وحدة مستقبلية تحتاج إلى "لقطة" (Snapshot) من البيانات
 *
 * المسؤوليات:
 *   1. تحميل Snapshot من IndexedDB (0ms) أو من Edge عند الحاجة
 *   2. فحص الإصدار تلقائياً في الخلفية (Stale-While-Revalidate)
 *   3. توفير واجهة موحدة لإعادة التحميل عند الطلب
 *   4. إدارة حالة التحميل والأخطاء (للـ UI)
 *
 * الاعتماد على:
 *   - snapshot-client.ts → fetchStoreSnapshot (الجلب مع Stale-While-Revalidate)
 *   - store-cache.ts → getStoredSnapshot, saveSnapshot, isSnapshotFresh
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchStoreSnapshot,
  type SnapshotPayload,
} from '@/lib/cache/snapshot-client';
import {
  getStoredSnapshot,
  saveSnapshot,
  isSnapshotFresh,
} from '@/lib/cache/store-cache';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

/**
 * نتيجة تحميل Snapshot
 */
export interface LoadSnapshotResult<T = SnapshotPayload> {
  /** البيانات الفعلية للـ Snapshot */
  data: T;
  /** رقم الإصدار */
  version: number;
  /** هل تم جلب البيانات من IndexedDB (Cache) أم من Edge؟ */
  fromCache: boolean;
  /** هل تم إعادة التحقق من الإصدار في الخلفية؟ (Stale-While-Revalidate) */
  backgroundCheckTriggered?: boolean;
}

/**
 * خيارات تحميل Snapshot
 */
export interface LoadSnapshotOptions {
  /** الحد الأقصى لعمر الـ Snapshot في Cache (بالثواني) قبل إعادة التحقق */
  maxAgeSeconds?: number;
  /** تجاهل Cache و جلب من Edge مباشرة */
  forceFresh?: boolean;
  /** AbortSignal لإلغاء الطلب */
  signal?: AbortSignal;
}

/**
 * حالة الـ Bootstrapper (لإدارة الـ UI)
 */
export interface BootstrapperState<T = SnapshotPayload> {
  /** بيانات Snapshot الحالية */
  snapshot: T | null;
  /** رقم الإصدار الحالي */
  version: number | null;
  /** هل يتم التحميل حالياً؟ */
  loading: boolean;
  /** هل تم التحميل من Cache؟ */
  fromCache: boolean;
  /** الخطأ إن وجد */
  error: Error | null;
}

// ============================================================
// 🔧 دوال مساعدة داخلية
// ============================================================

/**
 * التحقق من صحة كائن Snapshot (للتأكد من البنية الأساسية)
 */
export function isValidSnapshotPayload(data: unknown): data is SnapshotPayload {
  if (!data || typeof data !== 'object') return false;
  const payload = data as Partial<SnapshotPayload>;
  return (
    typeof payload.storeId === 'string' &&
    typeof payload.version === 'number' &&
    typeof payload.store === 'object' &&
    Array.isArray(payload.categories) &&
    Array.isArray(payload.products)
  );
}

// ============================================================
// 📤 الدوال الرئيسية
// ============================================================

/**
 * تحميل Snapshot المتجر مع استراتيجية Cache-First
 */
export async function loadSnapshot<T = SnapshotPayload>(
  storeSlug: string,
  options: LoadSnapshotOptions = {}
): Promise<LoadSnapshotResult<T>> {
  const { forceFresh = false, signal, maxAgeSeconds = 60 } = options;

  console.log(
    `📦 [Bootstrapper] Loading snapshot for store: ${storeSlug} ${forceFresh ? '(force fresh)' : ''}`
  );

  // 1️⃣ إذا كان الطلب قسرياً (forceFresh)، نتجاوز Cache
  if (forceFresh) {
    console.log(`🔄 [Bootstrapper] Force fresh fetch for ${storeSlug}`);
    const fresh = await fetchStoreSnapshot(storeSlug, { signal });
    
    await saveSnapshot(storeSlug, {
      storeId: fresh.data.storeId,
      version: fresh.version,
      data: fresh.data,
      timestamp: Date.now(),
    });

    return {
      data: fresh.data as T,
      version: fresh.version,
      fromCache: false,
      backgroundCheckTriggered: false,
    };
  }

  // 2️⃣ محاولة القراءة من IndexedDB
  try {
    const cached = await getStoredSnapshot<SnapshotPayload>(storeSlug);

    if (cached && cached.data) {
      const isFresh = isSnapshotFresh(cached, maxAgeSeconds);

      console.log(
        `📂 [Bootstrapper] Cache hit for ${storeSlug}: version ${cached.version} ` +
          `(fresh: ${isFresh})`
      );

      if (isFresh) {
        return {
          data: cached.data as T,
          version: cached.version,
          fromCache: true,
          backgroundCheckTriggered: false,
        };
      }

      console.log(`⏳ [Bootstrapper] Stale cache for ${storeSlug}, checking for update in background`);

      // تشغيل فحص الخلفية بشكل غير متزامن
      fetchStoreSnapshot(storeSlug, { signal })
        .then(async (fresh) => {
          console.log(
            `🔄 [Bootstrapper] Background update completed for ${storeSlug}: v${fresh.version}`
          );
          await saveSnapshot(storeSlug, {
            storeId: fresh.data.storeId,
            version: fresh.version,
            data: fresh.data,
            timestamp: Date.now(),
          });
        })
        .catch((error) => {
          console.warn(
            `[Bootstrapper] Background update failed for ${storeSlug}:`,
            error
          );
        });

      return {
        data: cached.data as T,
        version: cached.version,
        fromCache: true,
        backgroundCheckTriggered: true,
      };
    }

    // 3️⃣ لا يوجد Cache: جلب من Edge مباشرة
    console.log(`🌐 [Bootstrapper] No cache for ${storeSlug}, fetching from Edge`);

    const fresh = await fetchStoreSnapshot(storeSlug, { signal });

    await saveSnapshot(storeSlug, {
      storeId: fresh.data.storeId,
      version: fresh.version,
      data: fresh.data,
      timestamp: Date.now(),
    });

    return {
      data: fresh.data as T,
      version: fresh.version,
      fromCache: false,
      backgroundCheckTriggered: false,
    };
  } catch (error) {
    console.warn(`⚠️ [Bootstrapper] Failed to read from IndexedDB, falling back to network:`, error);

    const fresh = await fetchStoreSnapshot(storeSlug, { signal });
    await saveSnapshot(storeSlug, {
      storeId: fresh.data.storeId,
      version: fresh.version,
      data: fresh.data,
      timestamp: Date.now(),
    });

    return {
      data: fresh.data as T,
      version: fresh.version,
      fromCache: false,
      backgroundCheckTriggered: false,
    };
  }
}

// ============================================================
// 🧠 Bootstrapper Class (للحفاظ على الحالة والاشتراكات)
// ============================================================

export class Bootstrapper<T = SnapshotPayload> {
  private storeSlug: string;
  private state: BootstrapperState<T> = {
    snapshot: null,
    version: null,
    loading: false,
    fromCache: false,
    error: null,
  };
  private listeners: Set<(state: BootstrapperState<T>) => void> = new Set();
  private abortController: AbortController | null = null;
  private updateEventListener: ((e: Event) => void) | null = null;

  constructor(storeSlug: string) {
    this.storeSlug = storeSlug;
    this.setupBackgroundUpdateListener();
  }

  private setupBackgroundUpdateListener(): void {
    if (typeof window === 'undefined') return;

    this.updateEventListener = (event: Event) => {
      const customEvent = event as CustomEvent<SnapshotPayload>;
      if (customEvent.detail && customEvent.detail.store?.slug === this.storeSlug) {
        this.setState({
          snapshot: customEvent.detail as T,
          version: customEvent.detail.version,
          fromCache: false,
          loading: false,
          error: null,
        });
      }
    };

    window.addEventListener('store-snapshot-updated', this.updateEventListener);
  }

  getState(): BootstrapperState<T> {
    return { ...this.state };
  }

  subscribe(listener: (state: BootstrapperState<T>) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(partial: Partial<BootstrapperState<T>>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  async load(options: LoadSnapshotOptions = {}): Promise<LoadSnapshotResult<T>> {
    this.abortController?.abort();
    this.abortController = new AbortController();

    this.setState({ loading: true, error: null });

    try {
      const result = await loadSnapshot<T>(this.storeSlug, {
        ...options,
        signal: this.abortController.signal,
      });

      this.setState({
        snapshot: result.data,
        version: result.version,
        fromCache: result.fromCache,
        loading: false,
        error: null,
      });

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.setState({
        loading: false,
        error: err,
      });
      throw err;
    }
  }

  async refresh(): Promise<LoadSnapshotResult<T>> {
    return this.load({ forceFresh: true });
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.setState({ loading: false });
  }

  dispose(): void {
    this.abort();
    if (typeof window !== 'undefined' && this.updateEventListener) {
      window.removeEventListener('store-snapshot-updated', this.updateEventListener);
    }
    this.listeners.clear();
  }
}

// ============================================================
// 🎣 React Hook: useBootstrapper
// ============================================================

/**
 * Hook لجلب وإدارة Snapshot داخل مكونات React
 */
export function useBootstrapper<T = SnapshotPayload>(storeSlug: string) {
  const [state, setState] = useState<BootstrapperState<T>>({
    snapshot: null,
    version: null,
    loading: true,
    fromCache: false,
    error: null,
  });

  const bootstrapperRef = useRef<Bootstrapper<T> | null>(null);

  if (!bootstrapperRef.current) {
    bootstrapperRef.current = new Bootstrapper<T>(storeSlug);
  }

  useEffect(() => {
    const bootstrapper = bootstrapperRef.current;
    if (!bootstrapper) return;

    const unsubscribe = bootstrapper.subscribe((newState) => {
      setState(newState);
    });

    bootstrapper.load().catch((error) => {
      console.warn(`Failed to load snapshot for ${storeSlug}:`, error);
    });

    return () => {
      unsubscribe();
      bootstrapper.dispose();
    };
  }, [storeSlug]);

  const refetch = useCallback(async (options: LoadSnapshotOptions = {}) => {
    const bootstrapper = bootstrapperRef.current;
    if (!bootstrapper) return null;
    return bootstrapper.load({ ...options, forceFresh: true });
  }, []);

  return {
    snapshot: state.snapshot,
    version: state.version,
    loading: state.loading,
    fromCache: state.fromCache,
    error: state.error,
    refetch,
  };
}