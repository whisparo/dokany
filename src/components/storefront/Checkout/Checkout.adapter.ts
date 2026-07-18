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
  price: number;           // القيمة الخام بالسنت/المليم للحسابات
  rawPriceString: string;  // القيمة الحقيقية بالنص مخصصة للداتابيز (مثال: '100.00')
  rawLineTotalString: string; // إجمالي السطر بالنص مخصص للداتابيز (مثال: '200.00')
  formattedPrice: string; // منسق للعرض (مثال: ١٠٠ ج.م)
  formattedLineTotal: string; 
  quantity: number;
  image: string;
  maxStock: number;
}

export interface FormattedSummary {
  subtotal: number;
  rawSubtotalString: string; // مخصص للأوركستريتور والداتابيز
  formattedSubtotal: string;
  
  discount: number;
  rawDiscountString: string; // مخصص للأوركستريتور والداتابيز
  formattedDiscount: string;
  
  shippingCost: number;
  rawShippingCostString: string; // مخصص للأوركستريتور والداتابيز
  formattedShippingCost: string;
  
  tax: number;
  rawTaxString: string;
  formattedTax: string;
  
  total: number;
  rawTotalString: string; // مخصص للأوركستريتور والداتابيز
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

/**
 * تحويل الأرقام المخزنة بالسنت/المليم إلى نص مالي عشري نقي (Fixed String)
 * يحمي الداتابيز من الأرقام العشوائية ويحافظ على دقة الـ Decimal
 */
function toRawAmountString(amountInCents: number): string {
  return (amountInCents / 100).toFixed(2);
}

function calculateSummary(
  cartItems: CartItem[],
  shippingCost: number,
  discount: number = 0,
  taxRate: number = 0.14, 
  currency: string = 'EGP'
): FormattedSummary {
  const formatter = createCurrencyFormatter(currency);

  // إجمالي المنتجات بالسنت
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  // حساب الضريبة (تعديل الحسبة بناءً على رغبتك: إضافة فوق السعر أم متضمنة)
  // فرضنا هنا أنها متضمنة داخل السعر (Inclusive Tax)
  const tax = Math.round(subtotal - (subtotal / (1 + taxRate)));
  
  // حساب الإجمالي النهائي بالسنت
  const total = Math.max(0, subtotal + shippingCost - discount);

  return {
    subtotal,
    rawSubtotalString: toRawAmountString(subtotal),
    formattedSubtotal: formatter.format(subtotal / 100),
    
    discount,
    rawDiscountString: toRawAmountString(discount),
    formattedDiscount: formatter.format(discount / 100),
    
    shippingCost,
    rawShippingCostString: toRawAmountString(shippingCost),
    formattedShippingCost: shippingCost === 0 ? 'مجاني' : formatter.format(shippingCost / 100),
    
    tax,
    rawTaxString: toRawAmountString(tax),
    formattedTax: formatter.format(tax / 100), 
    
    total,
    rawTotalString: toRawAmountString(total),
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

  // ✅ 1. مواءمة العناصر وتوليد السلاسل النصية النقية للداتابيز
  const adaptedItems: CheckoutCartItem[] = cartItems.map((item) => {
    const lineTotalInCents = item.price * item.quantity;
    
    return {
      id: item.id,
      productId: item.productId,
      name: item.name,
      price: item.price,
      rawPriceString: toRawAmountString(item.price),
      rawLineTotalString: toRawAmountString(lineTotalInCents),
      formattedPrice: formatter.format(item.price / 100), 
      formattedLineTotal: formatter.format(lineTotalInCents / 100),
      quantity: item.quantity,
      image: item.image || '/images/default-product.png',
      maxStock: item.maxStock || 0,
    };
  });

  // ✅ 2. تحديد الشحن المختار بأمان مع Fallback
  const selectedShipping =
    shippingOptions.find((s) => s.id === selectedShippingId) || shippingOptions[0];
  
  const shippingCost = selectedShipping?.price || 0;

  // استدعاء الحسابات
  const summary = calculateSummary(
    cartItems,
    shippingCost,
    0, // قيمة الخصم الابتدائية (تُعدل عند إدخال كود كوبون)
    0.14, // نسبة ضريبة القيمة المضافة بمصر
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