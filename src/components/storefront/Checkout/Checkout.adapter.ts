// src/components/storefront/Checkout/Checkout.adapter.ts

import type { CartItem } from '@/stores/cart-store';
import type {
  CustomerData,
  ShippingOption,
  PaymentMethod,
  CheckoutRawData,
} from '@/lib/data/checkout-data-fetcher';

// ============================================================
// 📦 الأنواع (Types)
// ============================================================

export interface CheckoutCartItem {
  id: string;
  productId: string;
  name: string;
  price: number;          // السعر بالمليم/السنت الأصلي
  formattedPrice: string; // السعر الفردي منسق جاهز للعرض (مثال: ١٠٠ ج.م)
  formattedLineTotal: string; // إجمالي السعر للمنتج بناءً على الكمية (مثال: ٢٠٠ ج.م)
  quantity: number;
  image: string;
  maxStock: number;
}

export interface FormattedSummary {
  subtotal: number;
  formattedSubtotal: string;
  
  discount: number;
  formattedDiscount: string;
  
  shippingCost: number;
  formattedShippingCost: string;
  
  tax: number;
  formattedTax: string;
  
  total: number;
  formattedTotal: string;
  
  currency: string;
}

export interface CheckoutPayload {
  cartItems: CheckoutCartItem[];
  customer: CustomerData | null;
  shippingOptions: ShippingOption[];
  paymentMethods: PaymentMethod[];
  summary: FormattedSummary;
  storeId: string;
}

// ============================================================
// 🔧 دوال مساعدة للحسابات والتنسيق
// ============================================================

function createCurrencyFormatter(currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function calculateSummary(
  cartItems: CartItem[],
  shippingCost: number,
  discount: number = 0,
  taxRate: number = 0.14, 
  currency: string = 'EGP'
): FormattedSummary {
  const formatter = createCurrencyFormatter(currency);

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = Math.round(subtotal - (subtotal / (1 + taxRate)));
  const total = Math.max(0, subtotal + shippingCost - discount);

  return {
    subtotal,
    formattedSubtotal: formatter.format(subtotal / 100),
    
    discount,
    formattedDiscount: formatter.format(discount / 100),
    
    shippingCost,
    formattedShippingCost: shippingCost === 0 ? 'مجاني' : formatter.format(shippingCost / 100),
    
    tax,
    formattedTax: formatter.format(tax / 100), 
    
    total,
    formattedTotal: formatter.format(total / 100),
    
    currency,
  };
}

// ============================================================
// 🧠 الـ Adapter الرئيسي
// ============================================================

export function adaptCheckout(
  rawData: CheckoutRawData,
  selectedShippingId?: string,
  userCurrency: string = 'EGP'
): CheckoutPayload {
  const { cartItems, customer, shippingOptions, paymentMethods, storeId } = rawData;
  const formatter = createCurrencyFormatter(userCurrency);

  // ✅ 1. فصل السعر الفردي عن السعر الإجمالي للسطر لمنع الخلط البصري بالـ UI
  const adaptedItems: CheckoutCartItem[] = cartItems.map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    price: item.price,
    formattedPrice: formatter.format(item.price / 100), 
    formattedLineTotal: formatter.format((item.price * item.quantity) / 100),
    quantity: item.quantity,
    image: item.image || '/images/default-product.png',
    maxStock: item.maxStock || 0,
  }));

  // ✅ 2. تحديد الشحن المختار بأمان تام مع Fallback لأول عنصر متاح
  const selectedShipping =
    shippingOptions.find((s) => s.id === selectedShippingId) || shippingOptions[0];
  
  const shippingCost = selectedShipping?.price || 0;

  const summary = calculateSummary(
    cartItems,
    shippingCost,
    0, 
    0.14, 
    userCurrency
  );

  return {
    cartItems: adaptedItems,
    customer,
    shippingOptions,
    paymentMethods: paymentMethods.filter((pm) => pm.enabled),
    summary,
    storeId,
  };
}