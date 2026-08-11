// src/lib/services/orders-service.ts

import { schema, type D1Transaction } from '@/lib/db';
import type { NewOrder, Order } from '@/lib/db/schema/orders';
import type { NewOrderItem } from '@/lib/db/schema/order-items';
import { calculateLineTotal, calculateNetAmount } from '@/lib/db/schema/order-items';
import type { ProductOptions, OrderItemMetadata } from '@/lib/db/schema/order-items';
import { SystemError } from '@/lib/errors/types';
import { sql } from 'drizzle-orm';

export interface RawOrderItemInput {
  productId: string;
  variantSku: string;
  productName: string;
  productSku: string;
  productSlug?: string;
  productImage?: string;
  productOptions?: ProductOptions;
  orderedQty: number;
  price: string;
  originalPrice?: string;
  discount?: string;
  metadata?: OrderItemMetadata;
}

export class OrderService {
  /**
   * 1️⃣ توليد رقم طلب فريد وإنساني (Human-readable Order Number)
   */
  static generateOrderNumber(): string {
    const prefix = 'ORD';
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const timePart = Date.now().toString().slice(-4);
    return `${prefix}-${randomPart}-${timePart}`;
  }

  /**
   * 2️⃣ تحضير وحساب قيم عناصر الطلب للتأكد من أنها متوافقة مع شروط الـ DB
   */
  static prepareOrderItems(items: RawOrderItemInput[], storeId: string) {
    return items.map((item) => {
      const lineTotal = calculateLineTotal(item.price, item.orderedQty);
      const originalPrice = item.originalPrice || item.price;
      const discount = item.discount || '0';
      const netAmount = calculateNetAmount(lineTotal, discount, '0');

      return {
        storeId, // 👈 تم إضافة storeId لتطابق NewOrderItem Schema
        productId: item.productId,
        variantSku: item.variantSku,
        productName: item.productName,
        productSku: item.productSku,
        productSlug: item.productSlug,
        productImage: item.productImage,
        productOptions: item.productOptions || {},
        orderedQty: item.orderedQty,
        price: item.price,
        lineTotal,
        originalPrice,
        discount,
        netAmount,
        metadata: item.metadata || {},
      };
    });
  }
  /**
   * 3️⃣ التحقق من قيد المبالغ وقسمة الفواصل العائمة (Floating Point Protection)
   */
  static calculateOrderTotals(params: {
    subtotal: number;
    shippingCost: number;
    taxAmount?: number;
    discount?: number;
  }) {
    const subtotal = params.subtotal;
    const shippingCost = params.shippingCost;
    const taxAmount = params.taxAmount || 0;
    const discount = params.discount || 0;

    const totalRaw = subtotal + shippingCost + taxAmount - discount;
    const totalRounded = Math.round((totalRaw + Number.EPSILON) * 100) / 100;

    return {
      subtotal: subtotal.toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      discount: discount.toFixed(2),
      total: totalRounded.toFixed(2),
    };
  }

  /**
   * 4️⃣ حفظ رأس الطلب (Order Header) داخل قاعدة البيانات D1
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
      const [order] = await tx
        .insert(schema.orders)
        .values({
          ...orderData,
          id: orderData.id || crypto.randomUUID(),
          createdAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
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
   * 5️⃣ حفظ عناصر الطلب (Order Items) دفعة واحدة داخل قاعدة البيانات
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
      const valuesToInsert = items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        orderId,
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
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

// 🟢 Export مباشر لتسهيل الاستخدام
export const createOrder = OrderService.createOrder;
export const createOrderItems = OrderService.createOrderItems;
export const prepareOrderItems = OrderService.prepareOrderItems;
export const calculateOrderTotals = OrderService.calculateOrderTotals;
export const generateOrderNumber = OrderService.generateOrderNumber;