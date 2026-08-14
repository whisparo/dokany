// src/features/store-editor/components/overlay/EditorOverlayWrapper.tsx

'use client';

import React, { useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEditorStore } from '../../store/useEditorStore';

// ============================================================
// 🧩 استيراد ديناميكي للمكونات الثقيلة (ssr: false)
// ============================================================
const EditorControlBar = dynamic(
  () => import('../preview/EditorControlBar').then((mod) => mod.EditorControlBar),
  {
    ssr: false,
    loading: () => <EditorControlBarSkeleton />,
  }
);

// ============================================================
// 💀 Skeleton لشريط التحكم أثناء التحميل
// ============================================================
function EditorControlBarSkeleton() {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-200/20 dark:border-slate-700/20 px-4 py-2 min-w-[200px] animate-pulse">
      <div className="flex items-center gap-4 justify-center">
        <div className="w-20 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="w-20 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="w-20 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
      </div>
    </div>
  );
}

// ============================================================
// 📦 أنواع الـ Props
// ============================================================
interface EditorOverlayContentProps {
  storeId: string;
  storeSlug?: string;
  isOwner: boolean;
  editParam?: string;
}

interface EditorOverlayWrapperProps extends EditorOverlayContentProps {
  children: React.ReactNode;
}

// ============================================================
// 🎨 محتوى الـ Overlay (يستخدم useSearchParams - معزول داخل Suspense)
// ============================================================
function EditorOverlayContent({
  storeId,
  storeSlug,
  isOwner,
  editParam,
}: EditorOverlayContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    isEditMode,
    enableEditMode,
    disableEditMode,
    lastError,
    setLastError,
  } = useEditorStore();

  // ============================================================
  // 🧹 إزالة معامل edit من الـ URL بعد التفعيل
  // ============================================================
  const removeEditParamFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (params.has('edit')) {
      params.delete('edit');
      const queryString = params.toString();
      const newPath = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newPath, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  // ============================================================
  // 🚀 تفعيل/إلغاء وضع التحرير بناءً على editParam
  // ============================================================
  useEffect(() => {
    const shouldEnableEdit = editParam === '1' && isOwner && Boolean(storeId);

    if (shouldEnableEdit && !isEditMode) {
      enableEditMode(storeId, isOwner);
    } else if (!shouldEnableEdit && isEditMode) {
      disableEditMode();
    }
  }, [editParam, isOwner, storeId, isEditMode, enableEditMode, disableEditMode]);

  // ============================================================
  // ⌨️ اختصار Escape لإغلاق وضع التحرير
  // ============================================================
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditMode) {
        const isSuccess = disableEditMode();
        if (isSuccess) {
          removeEditParamFromUrl();
        }
      }
    };

    if (isEditMode) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isEditMode, disableEditMode, removeEditParamFromUrl]);

  // ✅ إذا مش في وضع التحرير أو مش المالك، ما نعرضش أي overlay
  if (!isEditMode || !isOwner) {
    return null;
  }

  // ✅ عرض طبقة الـ Overlay
  return (
    <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden={!isEditMode}>
      {/* ⚠️ عرض خطأ التحرير إن وجد */}
      {lastError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 pointer-events-auto">
          <span>⚠️</span>
          <span>{lastError}</span>
          <button
            onClick={() => setLastError(null)}
            className="hover:bg-white/20 rounded-full p-1 transition-colors"
            aria-label="إغلاق الخطأ"
          >
            ✕
          </button>
        </div>
      )}

      {/* 🛠️ شريط التحكم السفلي */}
      <EditorControlBar storeId={storeId} storeSlug={storeSlug} />
    </div>
  );
}

// ============================================================
// 🎯 المكون الرئيسي
// ============================================================
export function EditorOverlayWrapper({
  children,
  ...overlayProps
}: EditorOverlayWrapperProps) {
  return (
    <>
      {/* ✅ الطفل يُعرض دائماً خارج الـ Suspense */}
      {children}

      {/* ✅ الـ Overlay في Suspense منفصل لحماية useSearchParams */}
      <Suspense fallback={null}>
        <EditorOverlayContent {...overlayProps} />
      </Suspense>
    </>
  );
}