// src/lib/services/inventory-service.ts

import { schema, type D1Transaction } from '@/lib/db';
import { eq, sql, and, gte } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';

export type StockUpdateItem = {
  productId: string;
  variantSku?: string;
  quantity: number;
};

export async function updateStock(items: StockUpdateItem[], tx: D1Transaction): Promise<void> {
  if (!items || items.length === 0) return;

  try {
    for (const item of items) {
      if (item.quantity <= 0) continue;

      // تحديث مخزون المنتج الرئيسي بشرط أن يكون المخزون أكبر من أو يساوي الكمية المطلوبة
      const result = await tx
        .update(schema.products)
        .set({
          stock: sql`${schema.products.stock} - ${item.quantity}`,
        })
        .where(
          and(
            eq(schema.products.id, item.productId),
            gte(schema.products.stock, item.quantity)
          )
        )
        .returning({
          id: schema.products.id,
          stock: schema.products.stock,
        });

      if (!result || result.length === 0) {
        throw new SystemError({
          code: 'INV_400',
          userMessage: 'الكمية المطلوبة غير متوفرة حالياً في المخزن.',
          category: 'business',
          severity: 'warning',
          retryable: false,
          shouldAlert: false,
          technicalMessage: `Product ${item.productId} does not exist or has insufficient stock.`,
          metadata: {
            productId: item.productId,
            attemptedQuantity: item.quantity,
          },
        });
      }
    }
  } catch (error) {
    if (error instanceof SystemError) {
      throw error;
    }

    throw new SystemError({
      code: 'INV_500',
      userMessage: 'حدث خطأ غير متوقع أثناء تحديث المخزون، يرجى المحاولة لاحقاً.',
      category: 'database',
      severity: 'critical',
      retryable: true,
      shouldAlert: true,
      technicalMessage:
        error instanceof Error
          ? error.message
          : 'Unknown database error during stock update',
      cause: error,
      metadata: { originalError: String(error) },
    });
  }
}