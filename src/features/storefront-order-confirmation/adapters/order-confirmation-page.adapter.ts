// src/features/storefront-order-confirmation/adapters/order-confirmation-page.adapter.ts

import type { RawOrderConfirmationData } from '../data/order-confirmation-data-fetcher';

export interface OrderConfirmationViewModel {
  orderId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  currency: string;
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddressText: string | null;
  items: Array<{
    id: string;
    productTitle: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    variantName?: string;
  }>;
}

export function adaptOrderConfirmationPage(
  rawData: RawOrderConfirmationData
): OrderConfirmationViewModel {
  const { order, items, shippingAddress } = rawData;

  // 1. استخراج نص العنوان إما من جدول العناوين أو من كائن JSON المخزن في الطلب
  let addressText: string | null = null;

  if (shippingAddress) {
    addressText = `${shippingAddress.street}, ${shippingAddress.city}`;
  } else if (order.shippingAddress) {
    const jsonAddress = typeof order.shippingAddress === 'string'
      ? JSON.parse(order.shippingAddress)
      : order.shippingAddress;
      
    if (jsonAddress && typeof jsonAddress === 'object') {
      const parts = [jsonAddress.street, jsonAddress.city, jsonAddress.country].filter(Boolean);
      addressText = parts.length > 0 ? parts.join(', ') : null;
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber || order.id.slice(0, 8).toUpperCase(),
    status: order.status,
    createdAt: new Date(order.createdAt).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    currency: order.currency || 'EGP',
    
    // 🟢 ضبط أسماء الحقول حسب الـ Schema الخاصة بك (subtotal, shippingCost, total)
    subtotal: Number(order.subtotal || 0),
    shippingFee: Number(order.shippingCost || 0),
    totalAmount: Number(order.total || 0),

    customerName: order.customerName || 'عميل كريم',
    customerEmail: order.customerEmail || '',
    customerPhone: order.customerPhone || '',
    shippingAddressText: addressText,

    // 🟢 ضبط أسماء حقول العناصر (productName, orderedQty, price, lineTotal)
    items: items.map((item) => ({
      id: item.id,
      productTitle: item.productName,
      quantity: item.orderedQty,
      unitPrice: Number(item.price || 0),
      totalPrice: Number(item.lineTotal || 0),
      variantName: item.variantSku || undefined,
    })),
  };
}