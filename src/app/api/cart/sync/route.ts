// app/api/cart/sync/route.ts
import { NextResponse } from 'next/server';
// 1️⃣ استيراد الأنواع الرسمية من ملف الأنواع الموحد اللي عندك
import type { Product } from '@/types'; 
export const runtime = 'edge';

// 2️⃣ تعريف واجهة الـ Payload المتوقع استقباله من الفرونت إند بدقة
interface CartSyncPayload {
  items: {
    productId: string;
    quantity: number;
    variantId?: string;
  }[];
}

export async function POST(request: Request) {
  try {
    // 3️⃣ قراءة البيانات كـ unknown كخطوة أولى لحماية السيرفر
    const rawBody: unknown = await request.json();
    const idempotencyKey = request.headers.get('Idempotency-Key');

    // 4️⃣ الـ Type Guard: التحقق الذاتي للتأكد من أن الـ body يحتوي على مصفوفة items سليم
    if (!isValidCartPayload(rawBody)) {
      return NextResponse.json(
        { success: false, error: 'هيكل بيانات السلة غير صالح (Invalid Payload Structure)' },
        { status: 400 }
      );
    }

    // 5️⃣ هنا الـ TypeScript اتطمن 100% إن البيانات سليمة فبنعمل Casting آمن
    const body: CartSyncPayload = rawBody;

    // الآن تقدر تقرأ الـ items والـ Autocomplete هيظهرلك الخواص بدون أي خطأ!
    console.log('[API Cart Sync] Received items:', body.items);
    console.log('[API Cart Sync] Idempotency Key:', idempotencyKey);

    // رجع رد نجاح مؤقت عشان الـ Store يكمل شغله
    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
      warnings: []
    });
  } catch (error) {
    console.error('[API Cart Sync Error]:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * 🛡️ دالة التحقق الآمنة (Type Guard) للتأكد من سلامة الـ Data قبل معالجتها
 */
function isValidCartPayload(data: any): data is CartSyncPayload {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.items) &&
    data.items.every(
      (item: any) =>
        typeof item === 'object' &&
        typeof item.productId === 'string' &&
        typeof item.quantity === 'number'
    )
  );
}