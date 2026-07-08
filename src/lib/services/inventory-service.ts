// src/lib/services/inventory-service.ts

import { schema, type D1Transaction } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types'; 

type OrderItem = { productId: string; quantity: number };

export async function updateStock(items: OrderItem[], tx: D1Transaction): Promise<void> {
  if (!items || items.length === 0) return;

  try {
    for (const item of items) {
      // 🧠 طرح المخزون باستخدام معامل الـ sql بشكل آمن ومرن لـ SQLite
      const result = await tx
        .update(schema.products)
        .set({
          stock: sql`${schema.products.stock} - ${item.quantity}`,
        })
        .where(eq(schema.products.id, item.productId))
        .returning({ 
          id: schema.products.id, 
          stock: schema.products.stock 
        });

      // 🛑 دمج الأخطاء 1: المنتج مش موجود في السيستم
      if (!result || result.length === 0) {
        throw new SystemError({
          code: 'INV_404', // مطابق للـ Regex: /^[A-Z]{2,4}_\d{3}$/ لو حابب تلتزم بـ ErrorCodeDefinitionSchema
          userMessage: 'عذراً، هذا المنتج لم يعد متوفراً في المتجر.',
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          technicalMessage: `Product ID ${item.productId} does not exist in inventory.`,
          metadata: { productId: item.productId }
        });
      }

      // 🛑 دمج الأخطاء 2: المخزن غير كافي (تحت الصفر)
      if (result[0].stock < 0) {
        throw new SystemError({
          code: 'INV_400',
          userMessage: 'الكمية المطلوبة غير متوفرة حالياً في المخزن.',
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          technicalMessage: `Product ${item.productId} is out of stock or quantity requested exceeds available inventory.`,
          metadata: { 
            productId: item.productId, 
            attemptedQuantity: item.quantity,
            currentStock: result[0].stock + item.quantity 
          }
        });
      }
    }
  } catch (error) {
    // إذا كان الخطأ ممرر بالفعل كـ SystemError سيبه يمر
    if (error instanceof SystemError) {
      throw error;
    }
    
    // تغليف خطأ الداتابيز غير المتوقع بمطابقة السكيمة بالملي
    throw new SystemError({
      code: 'INV_500',
      userMessage: 'حدث خطأ غير متوقع أثناء تحديث المخزون، يرجى المحاولة لاحقاً.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true,
      technicalMessage: error instanceof Error ? error.message : 'Unknown database error during stock update',
      cause: error,
      metadata: { originalError: String(error) }
    });
  }
}