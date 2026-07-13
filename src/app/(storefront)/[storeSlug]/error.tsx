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
    console.error('[StoreError Boundary]:', error);
  }, [error]);

  return (
    // ✅ شلنا الـ role من هنا عشان نقفل خطأ الـ TypeScript فوراً
    <Container maxWidth="md" className="py-20 text-center" as="main">
      
      {/* ✅ نقلنا الـ alert للحاوية الفعلية للخطأ عشان الـ Screen Readers تقرأها صح بنظافة */}
      <div role="alert" aria-live="assertive" className="flex flex-col items-center">
        
        {/* أيقونة تحذيرية صديقة للـ A11y */}
        <div className="mb-6 text-6xl" aria-hidden="true">
          ⚠️
        </div>

        <Typography variant="h2" className="mb-4">
          حدث خطأ غير متوقع
        </Typography>

        <Typography variant="body1" className="text-muted-foreground mb-6">
          نعتذر، واجهنا مشكلة أثناء تحميل بيانات المتجر. برجاء إعادة المحاولة أو العودة للصفحة الرئيسية.
        </Typography>

        <div className="flex justify-center gap-4">
          <Button variant="primary" onClick={() => reset()}>
            إعادة المحاولة
          </Button>

          <Button variant="outline" onClick={() => router.push('/')}>
            الرئيسية
          </Button>
        </div>

        {error.digest && (
          <div className="mt-8 rounded-md bg-muted p-2 select-all">
            <Typography variant="caption" className="text-muted-foreground font-mono block">
              Error ID: {error.digest}
            </Typography>
          </div>
        )}
        
      </div>
    </Container>
  );
}