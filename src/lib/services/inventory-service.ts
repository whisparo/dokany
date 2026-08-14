// src/lib/services/inventory-service.ts

import { schema, type D1Transaction } from '@/lib/db';
import { eq, sql, and, gte, isNull } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';

export type StockUpdateItem = {
  productId: string;
  variantSku?: string;
  quantity: number; // قيمة موجبة للخصم، أو سالبة لإعادة التزويد (Restock)
};

/**
 * تحديث مخزون المنتجات داخل Transaction
 */
export async function updateStock(items: StockUpdateItem[], tx: D1Transaction): Promise<void> {
  if (!items || items.length === 0) return;

  try {
    for (const item of items) {
      if (item.quantity === 0) continue;

      const isDeduction = item.quantity > 0;

      const productWhere = isDeduction
        ? and(
            eq(schema.products.id, item.productId),
            isNull(schema.products.deletedAt),
            gte(schema.products.stock, item.quantity)
          )
        : and(
            eq(schema.products.id, item.productId),
            isNull(schema.products.deletedAt)
          );

      const result = await tx
        .update(schema.products)
        .set({
          stock: sql`${schema.products.stock} - ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(productWhere)
        .returning({
          id: schema.products.id,
          stock: schema.products.stock,
        });

      if (!result || result.length === 0) {
        throw new SystemError({
          code: 'INV_400',
          userMessage: 'الكمية المطلوبة للمنتج غير متوفرة حالياً في المخزن.',
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