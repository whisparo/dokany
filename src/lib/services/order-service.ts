// src/lib/services/orders-service.ts

import { schema, type D1Transaction } from '@/lib/db';
import type { NewOrder, Order } from '@/lib/db/schema/orders';
import type { NewOrderItem } from '@/lib/db/schema/order-items';
import type { ProductOptions, OrderItemMetadata } from '@/lib/db/schema/order-items';
import { SystemError } from '@/lib/errors/types';

export interface RawOrderItemInput {
  productId: string;
  variantSku: string;
  productName: string;
  productSku: string;
  productSlug?: string;
  productImage?: string;
  productOptions?: ProductOptions;
  orderedQty: number;
  /** السعر بالقرش/Cents لتفادي أخطاء التقريب */
  price: number;
  originalPrice?: number;
  discount?: number;
  metadata?: OrderItemMetadata;
}

export class OrderService {
  /**
   * 1️⃣ توليد رقم طلب فريد وإنساني آمن آلياً
   */
  static generateOrderNumber(): string {
    const prefix = 'ORD';
    
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const randomPart = array[0].toString(36).substring(0, 5).toUpperCase();
    
    const timePart = Date.now().toString().slice(-4);
    return `${prefix}-${randomPart}-${timePart}`;
  }

  /**
   * 2️⃣ تحضير وحساب قيم عناصر الطلب بالأعداد الصحيحة (Cents)
   */
  static prepareOrderItems(items: RawOrderItemInput[], storeId: string) {
    return items.map((item) => {
      const price = Math.round(item.price);
      const originalPrice = item.originalPrice !== undefined ? Math.round(item.originalPrice) : price;
      const discount = item.discount !== undefined ? Math.round(item.discount) : 0;
      
      const lineTotal = price * item.orderedQty;
      const netAmount = Math.max(0, lineTotal - discount);

      return {
        storeId,
        productId: item.productId,
        variantSku: item.variantSku,
        productName: item.productName,
        productSku: item.productSku,
        productSlug: item.productSlug,
        productImage: item.productImage,
        productOptions: item.productOptions || {},
        orderedQty: item.orderedQty,
        price,
        lineTotal,
        originalPrice,
        discount,
        netAmount,
        metadata: item.metadata || {},
      };
    });
  }

  /**
   * 3️⃣ حساب إجماليات الطلب بدقة بالقرش (Integer / Cents)
   */
  static calculateOrderTotals(params: {
    subtotal: number;
    shippingCost: number;
    taxAmount?: number;
    discount?: number;
  }) {
    const subtotal = Math.round(params.subtotal);
    const shippingCost = Math.round(params.shippingCost);
    const taxAmount = Math.round(params.taxAmount || 0);
    const discount = Math.round(params.discount || 0);

    const total = Math.max(0, subtotal + shippingCost + taxAmount - discount);

    return {
      subtotal,
      shippingCost,
      taxAmount,
      discount,
      total,
    };
  }

  /**
   * 4️⃣ حفظ رأس الطلب (Order Header)
   */
  static async createOrder(orderData: NewOrder, tx: D1Transaction): Promise<Order> {
    if (!orderData || !orderData.storeId || !orderData.customerId) {
      throw new SystemError({
        code: 'ORD_400',
        userMessage: 'فشلت معالجة الطلب بسبب نقص في البيانات الأساسية.',
        category: 'validation',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        technicalMessage: 'CREATE_ORDER_VALIDATION_FAILED: Missing mandatory fields (storeId or customerId).',
        metadata: { storeId: orderData.storeId, customerId: orderData.customerId },
      });
    }

    try {
      const now = new Date();
      const [order] = await tx
        .insert(schema.orders)
        .values({
          ...orderData,
          id: orderData.id || crypto.randomUUID(),
          createdAt: orderData.createdAt || now,
          updatedAt: orderData.updatedAt || now,
        })
        .returning();

      if (!order) {
        throw new SystemError({
          code: 'ORD_501',
          userMessage: 'حدث خطأ أثناء حفظ تفاصيل الطلب، يرجى المحاولة لاحقاً.',
          category: 'database',
          severity: 'critical',
          retryable: true,
          shouldAlert: true,
          technicalMessage: 'CREATE_ORDER_FAILED: Database did not return the created order.',
          metadata: { storeId: orderData.storeId },
        });
      }

      return order;
    } catch (error) {
      if (error instanceof SystemError) {
        throw error;
      }

      throw new SystemError({
        code: 'ORD_502',
        userMessage: 'نواجه مشكلة في الاتصال بقاعدة البيانات حالياً، جاري إعادة المحاولة.',
        category: 'database',
        severity: 'critical',
        retryable: true,
        shouldAlert: true,
        technicalMessage: `CREATE_ORDER_TRANSACTION_FAILED: Failed to persist order in database.`,
        cause: error,
        metadata: {
          storeId: orderData.storeId,
          originalError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * 5️⃣ حفظ عناصر الطلب (Order Items)
   */
  static async createOrderItems(
    orderId: string,
    items: Omit<NewOrderItem, 'id' | 'orderId' | 'createdAt' | 'updatedAt'>[],
    tx: D1Transaction
  ) {
    if (!items || items.length === 0) {
      return [];
    }

    try {
      const now = new Date();
      const valuesToInsert = items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        orderId,
        createdAt: now,
        updatedAt: now,
      }));

      const insertedItems = await tx
        .insert(schema.orderItems)
        .values(valuesToInsert)
        .returning();

      return insertedItems;
    } catch (error) {
      throw new SystemError({
        code: 'ORD_503',
        userMessage: 'فشل حفظ تفاصيل منتجات الطلب.',
        category: 'database',
        severity: 'critical',
        retryable: true,
        shouldAlert: true,
        technicalMessage: `CREATE_ORDER_ITEMS_FAILED: Failed to insert order items for orderId ${orderId}.`,
        cause: error,
        metadata: { orderId, itemsCount: items.length, originalError: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}

export const createOrder = OrderService.createOrder;
export const createOrderItems = OrderService.createOrderItems;
export const prepareOrderItems = OrderService.prepareOrderItems;
export const calculateOrderTotals = OrderService.calculateOrderTotals;
export const generateOrderNumber = OrderService.generateOrderNumber;