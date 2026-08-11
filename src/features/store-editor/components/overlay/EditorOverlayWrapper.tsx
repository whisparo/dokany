// src/features/store-editor/components/overlay/EditorOverlayWrapper.tsx

'use client';

/**
 * ============================================================
 * 🎨 EditorOverlayWrapper - طبقة التحرير الشفافة (Overlay)
 * الإصدار: 1.4 (App Router & Production Optimized)
 * ============================================================
 * 
 * 🎯 المسؤولية:
 * - تحميل كود التحرير ديناميكياً (ssr: false) لمنع تسريبه للزبائن
 * - عرض طبقة شفافة فوق المتجر دون التأثير على الـ Layout الأصلي
 * - إدارة اختصارات الكيبورد (Escape) ومسح الـ Query Params بسلاسة
 * - عرض شريط التحكم وتنبيهات الأخطاء اللحظية
 * ============================================================
 */

import React, { useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEditorStore } from '../../store/useEditorStore';

// ============================================================
// 🧩 استيراد ديناميكي (Lazy Loading) للمكونات الثقيلة
// ============================================================

const EditorControlBar = dynamic(
  () => import('../preview/EditorControlBar').then((mod) => mod.EditorControlBar),
  {
    ssr: false,
    loading: () => <EditorControlBarSkeleton />,
  }
);

// ============================================================
// 💀 Skeleton Components
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
// 📦 المكون الرئيسي
// ============================================================

interface EditorOverlayWrapperProps {
  /** معرف المتجر (للتحقق من الملكية) */
  storeId: string;
  /** اسم المتجر الفريد (للرابط) */
  storeSlug?: string;
  /** هل المستخدم هو مالك المتجر؟ */
  isOwner: boolean;
  /** الأطفال (محتوى المتجر الأصلي) */
  children: React.ReactNode;
  /** معامل التحرير (من URL) */
  editParam?: string;
}

export function EditorOverlayWrapper({
  storeId,
  storeSlug = '',
  isOwner,
  children,
  editParam,
}: EditorOverlayWrapperProps) {
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
  // 🔗 دالة معالجة تنظيف الـ URL من معامل edit
  // ============================================================
  const removeEditParamFromUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (params.has('edit')) {
      params.delete('edit');
      const queryString = params.toString();
      const newPath = queryString ? `${pathname}?${queryString}` : pathname;
      
      // التنسيق الأحدث لـ Next.js App Router مع الحفاظ على موضع التمرير
      router.replace(newPath, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  // ============================================================
  // 🧠 التحكم في تفعيل وتأمين وضع التحرير بناءً على الـ Params
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
  // ⌨️ التعامل مع زر Escape وخروج التحرير
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

  // ============================================================
  // 🛡️ العرض في حالة الزبون العادي أو عدم تفعيل التحرير
  // ============================================================
  if (!isEditMode || !isOwner) {
    return <>{children}</>;
  }

  // ============================================================
  // 🚀 عرض المحرر فوق المتجر
  // ============================================================
  return (
    <>
      {/* 👶 محتوى المتجر الأصلي */}
      {children}

      {/* 🎨 طبقة التحرير (Overlay) */}
      <div
        className="fixed inset-0 z-40 pointer-events-none"
        aria-hidden={!isEditMode}
      >
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
      </div>

      {/* 🛠️ شريط التحكم السفلي */}
      <EditorControlBar storeId={storeId} storeSlug={storeSlug} />
    </>
  );
}