// src/features/storefront-checkout/orchestrators/checkout.orchestrator.ts

import { getCheckoutRawData } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { adaptCheckoutPage } from '@/features/storefront-checkout/adapters/checkout-page.adapter';
import type { CheckoutPayload } from '@/features/storefront-checkout/adapters/checkout-page.adapter';

import { idempotency } from '@/lib/idempotency';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/db/schema/orders';
import type { ShippingAddress } from '@/lib/db/schema/orders';
import { orderItems } from '@/lib/db/schema/order-items';
import { products } from '@/lib/db/schema/products';
import type { ProductOptions, OrderItemMetadata } from '@/lib/db/schema/order-items';

import { inArray, and, eq, isNull, sql } from 'drizzle-orm';
import { SystemError } from '@/lib/errors/types';

import {
  updateStoreStatsAfterOrder,
  updateCustomerStats,
  updateProductStatsBatch,
} from '@/lib/services/store-stats';

import type { Env } from '@/lib/env';

export type ProcessCheckoutResult =
  | {
      success: true;
      orderId: string;
      orderNumber: string;
      message: string;
    }
  | {
      success: false;
      message: string;
      orderId?: undefined;
      orderNumber?: undefined;
    };

export async function getCheckoutData(
  storeId: string,
  env: Env,
  customerId?: string,
  selectedShippingId?: string,
  userCurrency: string = 'EGP'
): Promise<CheckoutPayload | null> {
  const rawData = await getCheckoutRawData(storeId, env, customerId);
  if (!rawData) return null;

  return adaptCheckoutPage(rawData, selectedShippingId, userCurrency);
}

function parseMoneyToInteger(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const parsed = parseInt(value, 10);
  if (!isNaN(parsed)) return Math.max(0, parsed);
  const floatParsed = parseFloat(value);
  return isNaN(floatParsed) ? 0 : Math.max(0, Math.round(floatParsed));
}

function generateOrderNumber(): string {
  const prefix = 'ORD';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${random}`;
}

export async function processCheckout(
  env: Env,
  idempotencyKey: string,
  trustedStoreId: string,
  trustedCustomerId: string | null,
  orderInput: {
    id?: string;
    orderNumber?: string;
    shippingAddress: ShippingAddress;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    currency?: string;
    shippingCost: string | number;
    taxAmount: string | number;
    discount: string | number;
    paymentMethod?: string;
    shippingMethod?: string;
    customerNotes?: string;
  },
  itemsInput: {
    productId: string;
    variantSku: string;
    productName: string;
    productSku: string;
    productSlug?: string;
    productImage?: string;
    productOptions?: ProductOptions;
    orderedQty: number;
    metadata?: OrderItemMetadata;
  }[]
): Promise<ProcessCheckoutResult> {
  if (!itemsInput || itemsInput.length === 0) {
    return {
      success: false,
      message: 'سلة الشراء فارغة، لا يمكن إتمام الطلب.',
    };
  }

  return await idempotency.execute(env, idempotencyKey, async (): Promise<ProcessCheckoutResult> => {
    const db = getDb(env);

    return await db.transaction(async (tx) => {
      // ═══════════════════════════════════════════════════════════
      // 🛡️ الخطوة أ: التحقق من الأسعار والمخزون من قاعدة البيانات
      // ═══════════════════════════════════════════════════════════
      const productIds = itemsInput.map((item) => item.productId);

      const dbProducts = await tx
        .select({
          id: products.id,
          price: products.price,
          compareAtPrice: products.compareAtPrice,
          stock: products.stock,
          name: products.name,
          isPublished: products.isPublished,
          deletedAt: products.deletedAt,
        })
        .from(products)
        .where(
          and(
            inArray(products.id, productIds),
            eq(products.storeId, trustedStoreId),
            isNull(products.deletedAt)
          )
        )
        .all();

      const productsMap = new Map(dbProducts.map((p) => [p.id, p]));

      const enrichedItems: Array<{
        input: (typeof itemsInput)[number];
        dbProduct: (typeof dbProducts)[number];
        unitPrice: number;
        lineTotal: number;
      }> = [];

      let calculatedSubtotal = 0;

      for (const item of itemsInput) {
        if (item.orderedQty <= 0) {
          throw new SystemError({
            code: 'INVALID_QUANTITY',
            userMessage: 'كمية المنتج غير صالحة.',
            technicalMessage: `Invalid quantity ${item.orderedQty} for product ${item.productId}`,
            category: 'validation',
            severity: 'info',
            retryable: false,
            shouldAlert: false,
            context: { extras: { productId: item.productId } } as unknown as SystemError['context'],
          });
        }

        const dbProduct = productsMap.get(item.productId);

        if (!dbProduct) {
          throw new SystemError({
            code: 'PRODUCT_NOT_FOUND',
            userMessage: `المنتج "${item.productName}" غير متاح حالياً.`,
            technicalMessage: `Product '${item.productId}' not found in store '${trustedStoreId}'.`,
            category: 'business',
            severity: 'warning',
            retryable: false,
            shouldAlert: false,
            context: { storeId: trustedStoreId, extras: { productId: item.productId } } as unknown as SystemError['context'],
          });
        }

        if (!dbProduct.isPublished) {
          throw new SystemError({
            code: 'PRODUCT_UNAVAILABLE',
            userMessage: `المنتج "${dbProduct.name}" غير متاح للشراء حالياً.`,
            technicalMessage: `Product '${item.productId}' is not published.`,
            category: 'business',
            severity: 'warning',
            retryable: false,
            shouldAlert: false,
            context: { extras: { productId: item.productId } } as unknown as SystemError['context'],
          });
        }

        if (dbProduct.stock < item.orderedQty) {
          throw new SystemError({
            code: 'INSUFFICIENT_STOCK',
            userMessage: `المخزون غير كافٍ للمنتج "${dbProduct.name}". المتاح: ${dbProduct.stock}`,
            technicalMessage: `Insufficient stock for product '${item.productId}'. Requested: ${item.orderedQty}, Available: ${dbProduct.stock}.`,
            category: 'business',
            severity: 'warning',
            retryable: false,
            shouldAlert: false,
            context: {
              extras: {
                productId: item.productId,
                requested: item.orderedQty,
                available: dbProduct.stock,
              },
            } as unknown as SystemError['context'],
          });
        }

        const unitPrice = parseMoneyToInteger(dbProduct.price);
        const lineTotal = unitPrice * item.orderedQty;
        calculatedSubtotal += lineTotal;

        enrichedItems.push({
          input: item,
          dbProduct,
          unitPrice,
          lineTotal,
        });
      }

      // ═══════════════════════════════════════════════════════════
      // 🧮 الخطوة ب: حساب الإجماليات
      // ═══════════════════════════════════════════════════════════
      const shippingCostCents = parseMoneyToInteger(orderInput.shippingCost);
      const taxAmountCents = parseMoneyToInteger(orderInput.taxAmount);
      const discountCents = parseMoneyToInteger(orderInput.discount);

      const effectiveDiscount = Math.min(discountCents, calculatedSubtotal);

      const totalAmountCents = Math.max(
        0,
        calculatedSubtotal + shippingCostCents + taxAmountCents - effectiveDiscount
      );

      const finalOrderNumber = orderInput.orderNumber || generateOrderNumber();

      // ═══════════════════════════════════════════════════════════
      // 📦 الخطوة ج: إنشاء الطلب الرئيسي (مع معالجة Safe-Type للعميل)
      // ═══════════════════════════════════════════════════════════
      const orderValues = {
        id: orderInput.id || crypto.randomUUID(),
        orderNumber: finalOrderNumber,
        storeId: trustedStoreId,
        customerId: trustedCustomerId ?? undefined, // 🛡️ ضمان عدم تمرير null لو الكولوم متوقع string بـ Schema
        shippingAddress: orderInput.shippingAddress,
        customerName: orderInput.customerName,
        customerPhone: orderInput.customerPhone,
        customerEmail: orderInput.customerEmail || null,
        currency: orderInput.currency || 'EGP',
        subtotal: calculatedSubtotal,
        shippingCost: shippingCostCents,
        taxAmount: taxAmountCents,
        discount: effectiveDiscount,
        total: totalAmountCents,
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: orderInput.paymentMethod || null,
        shippingMethod: orderInput.shippingMethod || 'standard',
        customerNotes: orderInput.customerNotes || null,
      } as typeof orders.$inferInsert;

      const [newOrder] = await tx.insert(orders).values(orderValues).returning();

      // ═══════════════════════════════════════════════════════════
      // 🛒 الخطوة د: إدراج عناصر الطلب
      // ═══════════════════════════════════════════════════════════
      const itemsToInsert: (typeof orderItems.$inferInsert)[] = enrichedItems.map(
        ({ input, dbProduct, unitPrice, lineTotal }) => ({
          orderId: newOrder.id,
          productId: input.productId,
          storeId: trustedStoreId,
          variantSku: input.variantSku,
          productName: input.productName,
          productSku: input.productSku,
          productSlug: input.productSlug || null,
          productImage: input.productImage || null,
          productOptions: input.productOptions || {},
          orderedQty: input.orderedQty,
          price: unitPrice,
          lineTotal: lineTotal,
          originalPrice: parseMoneyToInteger(dbProduct.compareAtPrice) || unitPrice,
          discount: 0,
          netAmount: lineTotal,
          status: 'pending',
          fulfillmentStatus: 'unfulfilled',
          metadata: input.metadata || {},
        })
      );

      await tx.insert(orderItems).values(itemsToInsert);

      // ═══════════════════════════════════════════════════════════
      // 📉 الخطوة هـ: خصم المخزون الذري (Atomic Stock Decrement)
      // ═══════════════════════════════════════════════════════════
      for (const item of enrichedItems) {
        const updateResult = await tx
          .update(products)
          .set({
            stock: sql`${products.stock} - ${item.input.orderedQty}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, item.input.productId),
              eq(products.storeId, trustedStoreId),
              sql`${products.stock} >= ${item.input.orderedQty}`
            )
          )
          .returning({ id: products.id });

        if (updateResult.length === 0) {
          throw new SystemError({
            code: 'INSUFFICIENT_STOCK_RACE',
            userMessage: `عذراً، حدث تغيير في مخزون "${item.dbProduct.name}". يرجى المحاولة مرة أخرى.`,
            technicalMessage: `Race condition detected: Stock insufficient for product '${item.input.productId}'.`,
            category: 'business',
            severity: 'warning',
            retryable: true,
            shouldAlert: false,
            context: { extras: { productId: item.input.productId } } as unknown as SystemError['context'],
          });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // 📊 الخطوة و: تحديث الإحصائيات
      // ═══════════════════════════════════════════════════════════
      await updateStoreStatsAfterOrder(env, trustedStoreId, totalAmountCents, tx);

      if (trustedCustomerId) {
        await updateCustomerStats(env, trustedCustomerId, totalAmountCents, tx);
      }

      await updateProductStatsBatch(
        env,
        enrichedItems.map(({ input }) => ({
          productId: input.productId,
          quantity: input.orderedQty,
        })),
        tx
      );

      return {
        success: true,
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        message: 'تم إنشاء الطلب بنجاح.',
      };
    });
  });
}