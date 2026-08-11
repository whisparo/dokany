// src/featuers/storefront-checkout/action/checkout.actions.ts
'use server';

import { redirect } from 'next/navigation';
import { getCloudflareContext } from '@opennextjs/cloudflare';

import { processCheckout } from '@/features/storefront-checkout/orchestrators/checkout.orchestrator';
import { CustomerService } from '@/lib/services/customer.service';
import { OrderService } from '@/lib/services/order-service';

// 🛡️ 1. استيراد دالة الحماية والـ Action Error Handler الموحد
import { enforceRateLimit } from '@/lib/rate-limit-client';
import { handleActionError } from '@/lib/error-handler';

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
  // 🟢 تمرير [0] للـ items فقط ليأخذ RawOrderItemInput[]
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
    // 🛡️ 2. تطبيق الـ Rate Limit قبل تنفيذ أي عمليات هامة أو الاتصال بالـ DB
    await enforceRateLimit({
      action: 'checkout',
      storeId: storeId,
    });

    // 🟢 استخراج env مباشرة ونظيف بدون Type Casting
    const { env } = await getCloudflareContext();

    // 👤 3. جلب أو إنشاء العميل
    const customer = await CustomerService.findOrCreateCustomer(env, {
      storeId,
      name: payload.customer.name,
      phone: payload.customer.phone,
      email: payload.customer.email,
    });

    // 📦 4. تحضير العناصر وحساب الإجماليات (🟢 تم تمرير storeId كمعامل ثانٍ)
    const preparedItems = OrderService.prepareOrderItems(payload.items, storeId);

    if (!preparedItems || preparedItems.length === 0) {
      return { success: false, error: 'سلة الشراء فارغة' };
    }

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

    // 🔄 5. التنفيذ عبر الأوركستريتر (تمرير env النظيف مباشرة)
    const result = await processCheckout(
      env,
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

    // 🎯 هنا TypeScript أدرك تماماً أن result هي من نوع النجاح وبها orderId و orderNumber
    const decodedSlug = decodeURIComponent(storeSlug);
    redirectUrlTarget = `/${decodedSlug}/order-confirmation?orderId=${result.orderId}&orderNumber=${result.orderNumber}`;

  } catch (err: unknown) {
    console.error('Checkout Submission Error:', err);

    // 🛠️ 6. معالجة موحدة لكل أنواع الأخطاء عبر handleActionError
    return {
      success: false,
      error: handleActionError(err),
    };
  }

  // 🚀 7. التوجيه الخارجي التلقائي خارج الـ try/catch
  if (redirectUrlTarget) {
    redirect(redirectUrlTarget);
  }

  return { success: true };
}