// app/(storefront)/[storeSlug]/error.tsx
'use client';

import { useEffect, useTransition } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import Button from '@/components/shared/Button';

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const params = useParams();
  const storeSlug = params?.storeSlug as string;
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    console.error('[StoreError Boundary Caught]:', error);

    const reportErrorToSystem = async () => {
      try {
        // جلب معلومات المرآة من الـ Storage لو متاح
        const mirrorVersion = typeof window !== 'undefined' 
          ? localStorage.getItem(`dokany_mirror_v_${storeSlug}`) || 'none'
          : 'none';

        await fetch('/api/errors/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'UI_BOUNDARY_001',
            userMessage: 'حدث خطأ في واجهة المتجر',
            technicalMessage: error.message || 'Unknown UI Error',
            category: 'system',
            severity: 'warning',
            metadata: {
              stack: error.stack,
              digest: error.digest,
              storeSlug,
              mirrorVersion,
              isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
              isIndexedDBSupported: typeof window !== 'undefined' && 'indexedDB' in window,
              url: typeof window !== 'undefined' ? window.location.href : '',
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            },
          }),
        });
      } catch (reportingError) {
        console.error('[System Error Notifier Failed]:', reportingError);
      }
    };

    reportErrorToSystem();
  }, [error, storeSlug]);

  // 🧹 مسح المرآة المحلية التالفة وإعادة المحاولة
  const handleResetAndPurgeMirror = () => {
    startTransition(async () => {
      try {
        if (typeof window !== 'undefined' && 'indexedDB' in window && storeSlug) {
          // مسح قاعدة بيانات IndexedDB الخاصة بمرآة هذا المتجر
          window.indexedDB.deleteDatabase(`dokany_store_${storeSlug}`);
          localStorage.removeItem(`dokany_mirror_v_${storeSlug}`);
        }
      } catch (e) {
        console.error('[Mirror Purge Failed]:', e);
      } finally {
        // إعادة تشغيل الـ Boundary للسحب من Edge Snapshot
        reset();
      }
    });
  };

  return (
    <Container maxWidth="md" className="py-20 text-center" as="main">
      <div role="alert" aria-live="assertive" className="flex flex-col items-center">
        <div className="mb-6 text-6xl" aria-hidden="true">
          ⚠️
        </div>

        <h2 className="mb-4 text-2xl font-bold text-destructive">
          حدث خطأ غير متوقع
        </h2>

        <p className="text-muted-foreground mb-6 max-w-md leading-relaxed text-base">
          نعتذر، واجهنا مشكلة أثناء تحميل بيانات المتجر. برجاء إعادة المحاولة لتحديث البيانات أو العودة للصفحة الرئيسية.
        </p>

        <div className="flex justify-center gap-4">
          <Button 
            variant="primary" 
            onClick={handleResetAndPurgeMirror}
            disabled={isPending}
          >
            {isPending ? 'جاري تنظيف الكاش...' : 'إعادة المحاولة'}
          </Button>

          <Button variant="outline" onClick={() => router.push('/')}>
            الرئيسية
          </Button>
        </div>

        {error.digest && (
          <div className="mt-8 rounded-lg bg-muted/60 p-3 select-all border border-muted flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              رمز تتبع المشكلة (Reference ID)
            </span>
            <code className="text-foreground font-mono block font-semibold text-xs">
              {error.digest}
            </code>
          </div>
        )}
      </div>
    </Container>
  );
}