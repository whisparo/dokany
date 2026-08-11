// src/features/store-editor/store/useEditorStore.ts

/**
 * ============================================================
 * 🎨 Editor Store - مدير حالة محرر المتجر
 * الإصدار: 1.1 (Production-Ready - Optimistic UI & Robust Uploads)
 * ============================================================
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================
// 📌 الأنواع (Types)
// ============================================================

export type EditorSlot = 
  | 'hero'            // منطقة الهيرو (السلايدر)
  | 'category'        // منطقة الأقسام
  | 'product'         // منطقة المنتجات
  | 'featured'        // المنطقة المميزة
  | 'footer'          // منطقة الفوتر
  | 'none';           // لا يوجد Slot نشط

export interface UploadMetadata {
  mediaType: 'image' | 'video';
  size: number;
  mimeType: string;
  processedUrl?: string;
  [key: string]: unknown;
}

export interface UploadState {
  id: string;
  tempUrl: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string | null;
  metadata?: UploadMetadata;
}

export interface EditorState {
  // 🔧 الحالة الأساسية
  isEditMode: boolean;
  activeSlot: EditorSlot;
  storeId: string | null;
  isOwner: boolean;
  isLoading: boolean;

  // ☁️ رفع الوسائط
  uploads: Record<string, UploadState>;
  lastError: string | null;

  // 🧠 الإجراءات (Actions)
  enableEditMode: (storeId: string, isOwner: boolean) => void;
  disableEditMode: (force?: boolean) => boolean;
  toggleEditMode: () => void;
  setActiveSlot: (slot: EditorSlot) => void;
  
  // Upload Lifecycle
  startUpload: (id: string, tempUrl: string, metadata?: UploadMetadata) => void;
  updateUploadProgress: (id: string, progress: number) => void;
  completeUpload: (id: string, processedUrl: string) => void;
  failUpload: (id: string, error: string) => void;
  removeUpload: (id: string) => void;
  clearUploads: () => void;
  
  // Utilities
  setLoading: (loading: boolean) => void;
  setLastError: (error: string | null) => void;
  reset: () => void;
}

// ============================================================
// 📦 الحالة الافتراضية
// ============================================================

const initialState = {
  isEditMode: false,
  activeSlot: 'none' as EditorSlot,
  storeId: null,
  isOwner: false,
  isLoading: false,
  uploads: {},
  lastError: null,
};

// ============================================================
// 🧠 إنشاء الـ Store
// ============================================================

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      enableEditMode: (storeId: string, isOwner: boolean) => {
        if (!isOwner) {
          console.warn('[EditorStore] Access denied: User is not the owner');
          set({ lastError: 'لا تملك صلاحية تحرير هذا المتجر' });
          return;
        }

        set({
          isEditMode: true,
          storeId,
          isOwner,
          activeSlot: 'none',
          lastError: null,
        });
      },

      /**
       * إلغاء وضع التحرير
       * @param force - تفادي التحقق من وجود رفع شغال إذا كان مطلوباً
       * @returns boolean - هل تم الإلغاء بنجاح أم تم منعه بسبب رفع جارٍ
       */
      disableEditMode: (force = false) => {
        const { uploads } = get();
        const hasActiveUploads = Object.values(uploads).some(
          (u) => u.status === 'uploading' || u.status === 'processing'
        );

        if (hasActiveUploads && !force) {
          console.warn('[EditorStore] Prevented closing editor during active uploads');
          set({ lastError: 'يرجى الانتظار حتى اكتمال رفع الملفات الحالية' });
          return false;
        }

        set({
          isEditMode: false,
          activeSlot: 'none',
          isLoading: false,
          uploads: {},
          lastError: null,
        });
        return true;
      },

      toggleEditMode: () => {
        const { isEditMode, storeId, isOwner, disableEditMode } = get();
        if (isEditMode) {
          disableEditMode();
        } else {
          if (storeId && isOwner) {
            set({ isEditMode: true, activeSlot: 'none', lastError: null });
          } else {
            console.warn('[EditorStore] Toggle failed: Missing storeId or ownership');
          }
        }
      },

      setActiveSlot: (slot: EditorSlot) => {
        const { isEditMode } = get();
        if (!isEditMode) {
          console.warn('[EditorStore] Cannot set active slot outside edit mode');
          return;
        }
        set({ activeSlot: slot });
      },

      startUpload: (id: string, tempUrl: string, metadata?: UploadMetadata) => {
        set((state) => ({
          uploads: {
            ...state.uploads,
            [id]: {
              id,
              tempUrl,
              status: 'uploading',
              progress: 0,
              error: null,
              metadata,
            },
          },
          isLoading: true,
        }));
      },

      updateUploadProgress: (id: string, progress: number) => {
        set((state) => {
          const existing = state.uploads[id];
          if (!existing) return state;

          return {
            uploads: {
              ...state.uploads,
              [id]: {
                ...existing,
                progress: Math.min(Math.max(progress, 0), 100),
              },
            },
          };
        });
      },

      completeUpload: (id: string, processedUrl: string) => {
        set((state) => {
          const existing = state.uploads[id];
          if (!existing) return state;

          const updatedUploads: Record<string, UploadState> = {
            ...state.uploads,
            [id]: {
              ...existing,
              status: 'completed',
              progress: 100,
              metadata: {
                ...existing.metadata,
                processedUrl,
              } as UploadMetadata, // 👈 إخبار TypeScript أن النتيجة مطابقة تماماً
            },
          };

          const stillHasActiveUploads = Object.values(updatedUploads).some(
            (u) => u.status === 'uploading' || u.status === 'processing'
          );

          return {
            uploads: updatedUploads,
            isLoading: stillHasActiveUploads,
          };
        });
      },

      failUpload: (id: string, error: string) => {
        set((state) => {
          const updatedUploads: Record<string, UploadState> = {
            ...state.uploads,
            [id]: {
              ...state.uploads[id],
              status: 'failed',
              error,
            },
          };

          const stillHasActiveUploads = Object.values(updatedUploads).some(
            (u) => u.status === 'uploading' || u.status === 'processing'
          );

          return {
            uploads: updatedUploads,
            lastError: error,
            isLoading: stillHasActiveUploads,
          };
        });
      },

      removeUpload: (id: string) => {
        set((state) => {
          const updatedUploads = { ...state.uploads };
          delete updatedUploads[id];

          const stillHasActiveUploads = Object.values(updatedUploads).some(
            (u) => u.status === 'uploading' || u.status === 'processing'
          );

          return {
            uploads: updatedUploads,
            isLoading: stillHasActiveUploads,
          };
        });
      },

      clearUploads: () => {
        set({ uploads: {}, isLoading: false });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setLastError: (error: string | null) => {
        set({ lastError: error });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'store-editor-store',
    }
  )
);

// ============================================================
// 🧪 Selectors (Performance Optimized)
// ============================================================

export const useCanEdit = () => useEditorStore((state) => state.isEditMode && state.isOwner);
export const useActiveSlot = () => useEditorStore((state) => state.activeSlot);

export const useHasActiveUploads = () => {
  return useEditorStore((state) =>
    Object.values(state.uploads).some(
      (u) => u.status === 'uploading' || u.status === 'processing'
    )
  );
};

export const useLastError = () => useEditorStore((state) => state.lastError);
export const useUploadsList = () => useEditorStore((state) => Object.values(state.uploads));