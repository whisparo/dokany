'use server';

import { getAppDb } from '@/lib/db/db';
import { orders } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export interface ActionResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 🔄 جلب حالة الطلب المحدثة لحظياً (للاستخدام في Client Polling إذا كان الطلب قيد المعالجة)
 */
export async function getLatestOrderStatusAction(
  orderId: string,
  storeId: string
): Promise<ActionResponse<{ status: string; updatedAt: Date }>> {
  try {
    const { db } = await getAppDb();

    const order = await db.query.orders.findFirst({
      columns: {
        status: true,
        updatedAt: true,
      },
      where: and(eq(orders.id, orderId), eq(orders.storeId, storeId)),
    });

    if (!order) {
      return { success: false, error: 'الطلب غير موجود' };
    }

    return {
      success: true,
      data: {
        status: order.status,
        updatedAt: order.updatedAt,
      },
    };
  } catch (error) {
    console.error('[order-confirmation.actions] getLatestOrderStatusAction Error:', error);
    return { success: false, error: 'حدث خطأ أثناء جلب حالة الطلب' };
  }
}

/**
 * ❌ إلغاء الطلب من قبل العميل (إذا كانت حالة الطلب تسمح بذلك)
 */
export async function cancelOrderAction(
  orderId: string,
  storeSlug: string
): Promise<ActionResponse> {
  try {
    const { db } = await getAppDb();

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });

    if (!order) {
      return { success: false, error: 'الطلب غير موجود' };
    }

    // السماح بالإلغاء فقط إذا كان الطلب معلقاً أو قيد الانتظار
    if (order.status !== 'pending' && order.status !== 'processing') {
      return {
        success: false,
        error: 'لا يمكن إلغاء الطلب في حالته الحالية',
      };
    }

    await db
      .update(orders)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    revalidatePath(`/[locale]/(storefront)/${storeSlug}/order-confirmation`, 'page');

    return { success: true };
  } catch (error) {
    console.error('[order-confirmation.actions] cancelOrderAction Error:', error);
    return { success: false, error: 'فشل إلغاء الطلب، يرجى التواصل مع الدعم' };
  }
}