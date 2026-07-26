// app/(storefront)/[storeSlug]/error.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Container } from '@/components/shared/Container';
import { Typography } from '@/components/shared/Typography';
import Button from '@/components/shared/Button';

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // 1. تسجيل محلي في الـ Console للتطوير السريع
    console.error('[StoreError Boundary Caught]:', error);

    // 2. 🚀 [شغل بريميوم] إرسال التقرير فوراً للـ API الخاص بنا للتسجيل في R2 / تليجرام
    const reportErrorToSystem = async () => {
      try {
        await fetch('/api/errors/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'UI_BOUNDARY_001', // كود موحد لأخطاء واجهة المستخدم
            message: error.message || 'خطأ غير معروف في واجهة المتجر',
            stack: error.stack,
            digest: error.digest, // الـ correlationId الفعلي في Next.js
            url: window.location.href,
            userAgent: navigator.userAgent,
          }),
        });
      } catch (reportingError) {
        // نضمن تماماً عدم إيقاف الصفحة أو حدوث سكتة قلبية للمنظومة لو السيرفر واقع
        console.error('[System Error Notifier Failed]:', reportingError);
      }
    };

    reportErrorToSystem();
  }, [error]);

  return (
    <Container maxWidth="md" className="py-20 text-center" as="main">
      <div role="alert" aria-live="assertive" className="flex flex-col items-center">
        
        {/* أيقونة تحذيرية صديقة للـ A11y */}
        <div className="mb-6 text-6xl" aria-hidden="true">
          ⚠️
        </div>

        <Typography variant="h2" className="mb-4 font-bold text-destructive">
          حدث خطأ غير متوقع
        </Typography>

        <Typography variant="body1" className="text-muted-foreground mb-6 max-w-md leading-relaxed">
          نعتذر، واجهنا مشكلة أثناء تحميل بيانات المتجر. برجاء إعادة المحاولة أو العودة للصفحة الرئيسية.
        </Typography>

        <div className="flex justify-center gap-4">
          <Button variant="primary" onClick={() => reset()}>
            إعادة المحاولة
          </Button>

          {/* استخدام router.push للرئيسية بدون ريلود كامل */}
          <Button variant="outline" onClick={() => router.push('/')}>
            الرئيسية
          </Button>
        </div>

        {/* عرض الـ Error ID بشكل فخم ومنظم للعميل ليسهّل الدعم الفني */}
        {error.digest && (
          <div className="mt-8 rounded-lg bg-muted/60 p-3 select-all border border-muted flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              رمز تتبع المشكلة (Reference ID)
            </span>
            <Typography variant="caption" className="text-foreground font-mono block font-semibold">
              {error.digest}
            </Typography>
          </div>
        )}
        
      </div>
    </Container>
  );
}