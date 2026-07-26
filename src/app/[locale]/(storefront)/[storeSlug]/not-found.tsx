// app/(storefront)/[storeSlug]/not-found.tsx

import Link from 'next/link';
import { Container } from '@/components/shared/Container';
import { Typography } from '@/components/shared/Typography';
import Button from '@/components/shared/Button';

export default function StoreNotFound() {
  return (
    <Container maxWidth="md" className="py-20 text-center" as="main">
      {/* أيقونة صديقة للـ A11y */}
      <div className="mb-6 text-8xl" aria-hidden="true">
        🔍
      </div>
      
      <Typography variant="h1" className="mb-4">
        المتجر غير موجود
      </Typography>
      
      <Typography variant="body1" className="text-muted-foreground mb-8">
        عذراً، لم نتمكن من العثور على المتجر المطلوب. ربما تم تحديث الرابط أو حذفه.
      </Typography>
      
      <div className="flex justify-center gap-4">
        {/* ✅ تحديد الـ variant صراحة لضمان ثبات الاستايل */}
        <Button variant="primary" asChild>
          <Link href="/">العودة للرئيسية</Link>
        </Button>
        
        <Button variant="outline" asChild>
          <Link href="/explore">تصفح المتاجر</Link>
        </Button>
      </div>
    </Container>
  );
}