// src/features/storefront-checkout/actions/checkout.actions.ts
'use server';

import { getCloudflareContext } from '@opennextjs/cloudflare';

import { CustomerService } from '@/lib/services/customer.service';
import { processOrder, type OrderInput } from '@/lib/services/order-processor';
import type { RawOrderItemInput } from '@/lib/services/order-service';

import { enforceRateLimit } from '@/lib/rate-limit-client';
import { handleActionError } from '@/lib/error-handler';

// ============================================================
// 📋 Types
// ============================================================

export interface ShippingAddress {
  street: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  recipientName: string;
  recipientPhone: string;
}

export interface CheckoutFormSubmission {
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  shippingAddress: ShippingAddress;
  items: RawOrderItemInput[];
  shippingCost: number;
  discountAmount?: number;
  taxAmount?: number;
  currency?: string;
  paymentMethod?: string;
  shippingMethod?: string;
  /** ⚠️ إلزامي: لازم ييجي من الـ Client عشان الـ Idempotency يشتغل صح */
  idempotencyKey: string;
}

export interface CheckoutActionResult {
  success: boolean;
  error?: string;
  orderId?: string;
  orderNumber?: string;
  redirectTo?: string;
}

// ============================================================
// 🎯 Main Action
// ============================================================

export async function handleCheckoutSubmit(
  storeSlug: string,
  storeId: string,
  payload: CheckoutFormSubmission
): Promise<CheckoutActionResult> {
  // ✅ Validation مبكر قبل أي عملية
  if (!payload.idempotencyKey || payload.idempotencyKey.trim() === '') {
    return {
      success: false,
      error: 'معرف العملية مفقود، يرجى تحديث الصفحة والمحاولة مرة أخرى.',
    };
  }

  if (!payload.items || payload.items.length === 0) {
    return { success: false, error: 'سلة الشراء فارغة' };
  }

  try {
    // ═══════════════════════════════════════════════════════════
    // 🛡️ 1. Rate Limiting
    // ═══════════════════════════════════════════════════════════
    await enforceRateLimit({
      action: 'checkout',
      storeId: storeId,
    });

    // ✅ جلب الـ Context كاملاً للاستفادة من waitUntil
    const cfContext = await getCloudflareContext();
    const env = cfContext.env;
    const waitUntil = cfContext.ctx?.waitUntil?.bind(cfContext.ctx);

    // ═══════════════════════════════════════════════════════════
    // 👤 2. جلب أو إنشاء العميل
    // ═══════════════════════════════════════════════════════════
    const customer = await CustomerService.findOrCreateCustomer(env, {
      name: payload.customer.name,
      phone: payload.customer.phone,
      email: payload.customer.email,
    });

    // ═══════════════════════════════════════════════════════════
    // 🧮 3. حساب الإجماليات (بـ Cents للحماية من أخطاء الفاصلة)
    // ═══════════════════════════════════════════════════════════
    const subtotalCents = payload.items.reduce((acc, item) => {
      const price = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
      const qty = typeof item.orderedQty === 'number' ? item.orderedQty : Number(item.orderedQty) || 0;
      return acc + Math.round(price * 100 * qty);
    }, 0);

    const shippingCostCents = Math.round((payload.shippingCost || 0) * 100);
    const taxAmountCents = Math.round((payload.taxAmount || 0) * 100);
    const discountCents = Math.round((payload.discountAmount || 0) * 100);

    const totalCents = Math.max(
      0,
      subtotalCents + shippingCostCents + taxAmountCents - Math.min(discountCents, subtotalCents)
    );

    // ═══════════════════════════════════════════════════════════
    // 🔑 4. Idempotency Key
    // ═══════════════════════════════════════════════════════════
    const idempotencyKey = payload.idempotencyKey;

    // ═══════════════════════════════════════════════════════════
    // 📦 5. بناء OrderInput
    // ═══════════════════════════════════════════════════════════
    const orderInput: OrderInput = {
      id: crypto.randomUUID(),
      storeId: storeId,
      customerId: customer.id,
      orderNumber: `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`,
      total: totalCents,
      currency: payload.currency || 'EGP',
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: payload.paymentMethod || 'cod',
      shippingMethod: payload.shippingMethod || 'standard',
      shippingCost: shippingCostCents,
      taxAmount: taxAmountCents,
      discount: Math.min(discountCents, subtotalCents),
      shippingAddress: payload.shippingAddress,
      customerName: payload.customer.name,
      customerPhone: payload.customer.phone,
      customerEmail: payload.customer.email,
      rawItems: payload.items,
    };

    // ═══════════════════════════════════════════════════════════
    // 🚀 6. تنفيذ الطلب (مع Idempotency + Atomic Reservation + waitUntil)
    // ═══════════════════════════════════════════════════════════
    const createdOrder = await processOrder(env, orderInput, idempotencyKey, waitUntil);

    if (!createdOrder) {
      return {
        success: false,
        error: 'فشل في إتمام الطلب، يرجى المحاولة لاحقاً',
      };
    }

    // ═══════════════════════════════════════════════════════════
    // 🎯 7. إرجاع URL للـ redirect
    // ═══════════════════════════════════════════════════════════
    const decodedSlug = decodeURIComponent(storeSlug);
    const redirectUrl = `/${decodedSlug}/order-confirmation?orderId=${createdOrder.id}&orderNumber=${createdOrder.orderNumber}`;

    return {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      redirectTo: redirectUrl,
    };
  } catch (err: unknown) {
    console.error('[Checkout] Submission Error:', err);

    return {
      success: false,
      error: handleActionError(err),
    };
  }
}