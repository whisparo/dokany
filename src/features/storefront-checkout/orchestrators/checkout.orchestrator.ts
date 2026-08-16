// src/features/storefront-checkout/orchestrators/checkout.orchestrator.ts

import { getCheckoutRawData } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { adaptCheckoutPage } from '@/features/storefront-checkout/adapters/checkout-page.adapter';
import type { CheckoutPayload } from '@/features/storefront-checkout/adapters/checkout-page.adapter';

import { processOrder, type OrderInput } from '@/lib/services/order-processor';
import { prepareOrderItems, type RawOrderItemInput } from '@/lib/services/order-service';
import type { ShippingAddress } from '@/lib/db/schema/orders';
import { SystemError } from '@/lib/errors/types';

import type { Env } from '@/lib/env';

// ============================================================
// 📦 أنواع (Types)
// ============================================================

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

// ============================================================
// 🛒 جلب بيانات صفحة الدفع
// ============================================================

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

// ============================================================
// 💳 معالجة عملية الدفع (باستخدام العداد الذري)
// ============================================================

function generateOrderNumber(): string {
  const prefix = 'ORD';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${timestamp}-${random}`;
}

function parseMoneyToInteger(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Math.max(0, Math.round(value));
  const parsed = parseInt(value, 10);
  if (!isNaN(parsed)) return Math.max(0, parsed);
  const floatParsed = parseFloat(value);
  return isNaN(floatParsed) ? 0 : Math.max(0, Math.round(floatParsed));
}

export async function processCheckout(
  env: Env,
  idempotencyKey: string,
  trustedStoreId: string,
  trustedCustomerId: string, // 🔥 إزالة | null (العميل دائماً موجود)
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
  itemsInput: RawOrderItemInput[]
): Promise<ProcessCheckoutResult> {
  // ============================================================
  // 🛡️ التحقق الأولي
  // ============================================================

  if (!itemsInput || itemsInput.length === 0) {
    return {
      success: false,
      message: 'سلة الشراء فارغة، لا يمكن إتمام الطلب.',
    };
  }

  try {
    // ============================================================
    // 📦 تحضير عناصر الطلب (مع التحقق من الصلاحية)
    // ============================================================

    const preparedItems = prepareOrderItems(itemsInput, trustedStoreId);

    if (!preparedItems || preparedItems.length === 0) {
      return {
        success: false,
        message: 'سلة الشراء فارغة، لا يمكن إتمام الطلب.',
      };
    }

    // ============================================================
    // 🧮 حساب الإجماليات
    // ============================================================

    const subtotal = preparedItems.reduce(
      (acc, item) => acc + (typeof item.lineTotal === 'number' ? item.lineTotal : Number(item.lineTotal) || 0),
      0
    );

    const shippingCostCents = parseMoneyToInteger(orderInput.shippingCost);
    const taxAmountCents = parseMoneyToInteger(orderInput.taxAmount);
    const discountCents = parseMoneyToInteger(orderInput.discount);

    const effectiveDiscount = Math.min(discountCents, subtotal);

    const totalAmountCents = Math.max(
      0,
      subtotal + shippingCostCents + taxAmountCents - effectiveDiscount
    );

    // ============================================================
    // 📋 بناء كائن الطلب (OrderInput) لـ processOrder
    // ============================================================

    const finalOrderNumber = orderInput.orderNumber || generateOrderNumber();

    const orderData: OrderInput = {
      id: orderInput.id || crypto.randomUUID(),
      orderNumber: finalOrderNumber,
      storeId: trustedStoreId,
      customerId: trustedCustomerId, // 🔥 مباشرة (ليس ?? undefined)
      shippingAddress: orderInput.shippingAddress,
      customerName: orderInput.customerName,
      customerPhone: orderInput.customerPhone,
      customerEmail: orderInput.customerEmail || null,
      currency: orderInput.currency || 'EGP',
      subtotal: subtotal,
      shippingCost: shippingCostCents,
      taxAmount: taxAmountCents,
      discount: effectiveDiscount,
      total: totalAmountCents,
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: orderInput.paymentMethod || null,
      shippingMethod: orderInput.shippingMethod || 'standard',
      customerNotes: orderInput.customerNotes || null,
      rawItems: itemsInput,
    };

    // ============================================================
    // 🚀 تنفيذ الطلب باستخدام العداد الذري
    // ============================================================

    const newOrder = await processOrder(env, orderData, idempotencyKey);

    return {
      success: true,
      orderId: newOrder.id,
      orderNumber: newOrder.orderNumber,
      message: 'تم إنشاء الطلب بنجاح.',
    };
  } catch (error) {
    // ============================================================
    // ❌ معالجة الأخطاء
    // ============================================================

    if (error instanceof SystemError) {
      if (!error.retryable) {
        return {
          success: false,
          message: error.userMessage || 'حدث خطأ أثناء إتمام الطلب.',
        };
      }

      return {
        success: false,
        message: error.userMessage || 'الخدمة مشغولة حالياً، يرجى المحاولة مرة أخرى.',
      };
    }

    console.error('[Checkout Orchestrator] Unexpected error:', error);

    return {
      success: false,
      message: error instanceof Error ? error.message : 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً.',
    };
  }
}