// src/featuers/storefront-checkout/action/checkout.actions.ts
'use server';

import { redirect } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Env } from '@/lib/env';

import { processCheckout } from '@/features/storefront-checkout/orchestrators/checkout.orchestrator';
import { CustomerService } from '@/lib/services/customer.service';
import { OrderService } from '@/lib/services/order-service';
import { SystemError } from '@/lib/errors/types';

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
  // ⚡ استخدام ReturnType للتعرف التلقائي على نوع العناصر المدخلة والمخرجة
  items: Parameters<typeof OrderService.prepareOrderItems>[0];
  shippingCost: number;
  discountAmount?: number;
  taxAmount?: number;
  currency?: string;
  paymentMethod?: string;
  shippingMethod?: string;
  idempotencyKey?: string;
}

export interface CheckoutActionResult {
  success: boolean;
  error?: string;
  orderId?: string;
  orderNumber?: string;
}

export async function handleCheckoutSubmit(
  storeSlug: string,
  storeId: string,
  payload: CheckoutFormSubmission
): Promise<CheckoutActionResult> {
  let redirectUrlTarget: string | null = null;

  try {
    const context = await getCloudflareContext();
    const env = context.env as unknown as Env;

    if (!env?.DB) {
      return { success: false, error: 'تعذر الاتصال بقاعدة البيانات' };
    }

    // 👤 1. جلب أو إنشاء العميل
    const customer = await CustomerService.findOrCreateCustomer(env, {
      storeId,
      name: payload.customer.name,
      phone: payload.customer.phone,
      email: payload.customer.email,
    });

    // 📦 2. تحضير العناصر وحساب الإجماليات (استنتاج النوع تلقائياً دون استيراد صريح)
    const preparedItems = OrderService.prepareOrderItems(payload.items);

    if (!preparedItems || preparedItems.length === 0) {
      return { success: false, error: 'سلة الشراء فارغة' };
    }

    // ⚡ حساب الإجمالي الفرعي بأمان بدون مشاكل في الأنواع
    const subtotalNumber = preparedItems.reduce(
      (acc, item) => acc + (parseFloat(item.lineTotal) || 0),
      0
    );

    const totals = OrderService.calculateOrderTotals({
      subtotal: subtotalNumber,
      shippingCost: payload.shippingCost,
      taxAmount: payload.taxAmount,
      discount: payload.discountAmount,
    });

    const orderId = crypto.randomUUID();
    const orderNumber = OrderService.generateOrderNumber();
    const idempotencyKey = payload.idempotencyKey || `chk_${orderId}`;

    // 🔄 3. التنفيذ عبر الأوركستريتر
    const result = await processCheckout(
      env as Env & Record<string, unknown>,
      idempotencyKey,
      {
        id: orderId,
        orderNumber,
        storeId,
        customerId: customer.id,
        shippingAddress: payload.shippingAddress,
        customerName: payload.customer.name,
        customerPhone: payload.customer.phone,
        customerEmail: payload.customer.email,
        currency: payload.currency || 'EGP',
        subtotal: totals.subtotal,
        shippingCost: totals.shippingCost,
        taxAmount: totals.taxAmount,
        discount: totals.discount,
        total: totals.total,
        paymentMethod: payload.paymentMethod || 'cod',
        shippingMethod: payload.shippingMethod || 'standard',
      },
      preparedItems
    );

    if (!result.success) {
      return {
        success: false,
        error: result.message || 'فشل في إتمام الطلب، يرجى المحاولة لاحقاً',
      };
    }

    // 🎯 تجهيز رابط التوجيه عند النجاح
    const decodedSlug = decodeURIComponent(storeSlug);
    redirectUrlTarget = `/${decodedSlug}/order-confirmation?orderId=${result.orderId}&orderNumber=${result.orderNumber}`;

  } catch (err: unknown) {
    console.error('Checkout Submission Error:', err);

    if (err instanceof SystemError) {
      return {
        success: false,
        error: err.userMessage,
      };
    }

    const errorMessage = err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء تنفيذ الطلب';
    return {
      success: false,
      error: errorMessage,
    };
  }

  // 🚀 4. التوجيه الخارجي التلقائي خارج الـ try/catch
  if (redirectUrlTarget) {
    redirect(redirectUrlTarget);
  }

  return { success: true };
}