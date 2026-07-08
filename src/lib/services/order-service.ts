// src/lib/services/orders-service.ts

import { schema, type D1Transaction } from '@/lib/db'; 
import type { NewOrder } from '@/lib/db/schema/orders';
import { SystemError } from '@/lib/errors/types'; // 🚀 استيراد كلاس الأخطاء الموحد

export async function createOrder(orderData: NewOrder, tx: D1Transaction) { 
  // تأمين المدخلات قبل التخزين للتأكد من وجود البيانات الأساسية
  if (!orderData || !orderData.storeId || !orderData.customerId) {
    throw new SystemError({
      code: 'ORD_400',
      userMessage: 'فشلت معالجة الطلب بسبب نقص في البيانات الأساسية.',
      category: 'validation',
      severity: 'warning',
      retryable: false,
      shouldAlert: false, // خطأ مدخلات من العميل، مش محتاج يزعجك على تليجرام
      technicalMessage: 'CREATE_ORDER_VALIDATION_FAILED: Missing mandatory fields (storeId or customerId).',
      metadata: { orderData }
    });
  }

  try {
    const [order] = await tx
      .insert(schema.orders)
      .values({
        ...orderData,
        id: crypto.randomUUID(),
        createdAt: new Date(), 
        updatedAt: new Date(), 
      })
      .returning();
      
    // 🛑 دمج الأخطاء: التأكد من نجاح عملية الإدخال ورجوع الكائن
    if (!order) {
      throw new SystemError({
        code: 'ORD_501',
        userMessage: 'حدث خطأ أثناء حفظ تفاصيل الطلب، يرجى المحاولة لاحقاً.',
        category: 'database',
        severity: 'critical',
        retryable: true,
        shouldAlert: true, // قاعدة البيانات مهنجة ومبرجعتش الـ Order! ده محتاج تنبيه فوري
        technicalMessage: 'CREATE_ORDER_FAILED: Database did not return the created order.',
        metadata: { storeId: orderData.storeId }
      });
    }
      
    return order;
  } catch (error) {
    if (error instanceof SystemError) {
      throw error;
    }

    // 🛑 دمج الأخطاء الحرج: فشل التخزين الفعلي في قاعدة البيانات
    throw new SystemError({
      code: 'ORD_502',
      userMessage: 'نواجه مشكلة في الاتصال بقاعدة البيانات حالياً، جاري إعادة المحاولة.',
      category: 'database',
      severity: 'critical',
      retryable: true, // الـ Orchestrator هيلقط دي ويعيد المحاولة 3 مرات بناءً على الـ loop
      shouldAlert: true,
      technicalMessage: `CREATE_ORDER_TRANSACTION_FAILED: Failed to persist order in database.`,
      cause: error,
      metadata: { 
        storeId: orderData.storeId,
        originalError: error instanceof Error ? error.message : String(error)
      }
    });
  }
}