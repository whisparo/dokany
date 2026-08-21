// src/features/storefront-checkout/actions/checkout.actions.ts
'use server';

import { getCloudflareContext } from '@opennextjs/cloudflare';

import { CustomerService } from '@/lib/services/customer.service';
import { processOrder, type OrderInput } from '@/lib/services/order-processor';
import type { RawOrderItemInput } from '@/lib/services/order-service';

import { enforceRateLimit } from '@/lib/rate-limit-client';
import { handleActionError } from '@/lib/error-handler';
import { getOrWarmupStock, deductStockCache, rollbackStockCache } from '@/lib/cache/edge-stock-cache';
import { TelegramBusinessChannel } from '@/lib/alerts/channels/telegram-business';
import type { AlertEvent } from '@/lib/alerts/types';

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
  idempotencyKey: string;
}

export interface CheckoutActionResult {
  success: boolean;
  error?: string;
  orderId?: string;
  orderNumber?: string;
  redirectTo?: string;
}

export async function handleCheckoutSubmit(
  storeSlug: string,
  storeId: string,
  payload: CheckoutFormSubmission
): Promise<CheckoutActionResult> {
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
    // 🛡️ 1. Rate Limiting
    await enforceRateLimit({
      action: 'checkout',
      storeId: storeId,
    });

    const cfContext = await getCloudflareContext();
    const env = cfContext.env;
    const waitUntil = cfContext.ctx?.waitUntil?.bind(cfContext.ctx);

    // ⚡ 2. تجهيز المنتجات المعالجة وتحويل المبالغ إلى أعداد صحيحة (Cents/Integers)
    const processedItems: { productId: string; qty: number; unitPriceCents: number }[] = [];

    for (const item of payload.items) {
      const qty = typeof item.orderedQty === 'number' ? item.orderedQty : Number(item.orderedQty) || 1;
      const unitPriceCents = Math.round((typeof item.price === 'number' ? item.price : Number(item.price) || 0) * 100);

      if (qty <= 0) {
        return { success: false, error: 'كميات المنتجات غير صالحة' };
      }

      processedItems.push({
        productId: item.productId,
        qty,
        unitPriceCents,
      });
    }

    // ⚡ 3. فحص الكاش بالتوازي (Parallel Cache Check) لتجنب الـ Sequential Latency
    const stockChecks = await Promise.all(
      processedItems.map(async (item) => {
        const availableStock = await getOrWarmupStock(env, storeId, item.productId);
        return { productId: item.productId, availableStock, requiredQty: item.qty };
      })
    );

    const insufficientItem = stockChecks.find((check) => check.availableStock < check.requiredQty);
    if (insufficientItem) {
      return {
        success: false,
        error: 'عذراً، الكمية المطلوبة لبعض المنتجات غير متوفرة حالياً.',
      };
    }

    // 👤 4. إدارة العميل
    const customer = await CustomerService.findOrCreateCustomer(env, {
      name: payload.customer.name,
      phone: payload.customer.phone,
      email: payload.customer.email,
    });

    // 🧮 5. الحسابات المالية الدقيقة
    const subtotalCents = processedItems.reduce((acc, item) => acc + item.unitPriceCents * item.qty, 0);
    const shippingCostCents = Math.round((payload.shippingCost || 0) * 100);
    const taxAmountCents = Math.round((payload.taxAmount || 0) * 100);
    const discountCents = Math.round((payload.discountAmount || 0) * 100);

    const totalCents = Math.max(
      0,
      subtotalCents + shippingCostCents + taxAmountCents - Math.min(discountCents, subtotalCents)
    );

    // 📉 6. الخصم التراكمي المحمي مع تتبع التراجع (Rollback Tracker)
    const successfullyDeducted: { productId: string; qty: number }[] = [];

    try {
      for (const item of processedItems) {
        await deductStockCache(env, storeId, item.productId, item.qty);
        successfullyDeducted.push({ productId: item.productId, qty: item.qty });
      }
    } catch (deductErr) {
      // 🔄 التراجع التراكمي فور حدوث خطأ أثناء خصم أحد المنتجات
      await Promise.all(
        successfullyDeducted.map((deducted) =>
          rollbackStockCache(env, storeId, deducted.productId, deducted.qty)
        )
      );
      return {
        success: false,
        error: 'حدث خطأ أثناء تحديث مخزون المنتجات، يرجى إعادة المحاولة.',
      };
    }

    // 📦 7. بناء بيانات الطلب وإرساله للـ Pipeline
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

    let createdOrder;
    try {
      createdOrder = await processOrder(env, orderInput, payload.idempotencyKey, waitUntil);
    } catch (processErr: unknown) {
      // 🔄 التراجع في حال فشل معالجة الطلب
      await Promise.all(
        successfullyDeducted.map((deducted) =>
          rollbackStockCache(env, storeId, deducted.productId, deducted.qty)
        )
      );
      throw processErr;
    }

    if (!createdOrder) {
      await Promise.all(
        successfullyDeducted.map((deducted) =>
          rollbackStockCache(env, storeId, deducted.productId, deducted.qty)
        )
      );
      return {
        success: false,
        error: 'فشل في إتمام الطلب، يرجى المحاولة لاحقاً',
      };
    }

    // 📣 8. التنبيهات الجانبية في الخلفية (Non-blocking)
    if (waitUntil) {
      const telegramChannel = new TelegramBusinessChannel();
      const alertEvent: AlertEvent<'NEW_ORDER'> = {
        id: crypto.randomUUID(),
        type: 'NEW_ORDER',
        severity: 'INFO',
        timestamp: Date.now(),
        payload: {
          storeId: storeId,
          orderId: createdOrder.id,
          customerName: payload.customer.name,
          totalAmount: totalCents,
          currency: payload.currency || 'EGP',
          itemsCount: payload.items.length,
        },
      };

      waitUntil(
        telegramChannel
          .send(alertEvent, env)
          .catch((err: unknown) => console.error('[Telegram Alert Error]:', err))
      );
    }

    // 🎯 9. التوجيه لصفحة التأكيد
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