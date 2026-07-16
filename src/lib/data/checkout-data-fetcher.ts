// src/lib/data/checkout-data-fetcher.ts

import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers'; // ✅ لجلب الـ Session ID بأمان
import type { CartItem } from '@/stores/cart-store';

// ============================================================
// 📦 الأنواع (Types)
// ============================================================

export interface CustomerData {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  address?: {
    street: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
}

export interface ShippingOption {
  id: string;
  name: string;
  description?: string;
  price: number; // بالسنت
  estimatedDays?: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'cod' | 'card' | 'wallet' | 'bank_transfer';
  description?: string;
  enabled: boolean;
  icon?: string;
}

export interface CheckoutRawData {
  cartItems: CartItem[];
  customer: CustomerData | null;
  shippingOptions: ShippingOption[];
  paymentMethods: PaymentMethod[];
  storeId: string;
  currency: string;
}

// ============================================================
// 🗄️ دوال جلب البيانات الديناميكية (بدون كاش للأمان وحداثة السعر)
// ============================================================

/**
 * جلب عناصر السلة (بث مباشر من قاعدة البيانات لضمان عدم تلاعب العميل بالأسعار والكاش)
 */
async function fetchCartItems(uniqueKey: string, storeId: string): Promise<CartItem[]> {
  // TODO: في الإنتاج، اقرأ الـ Cart من قاعدة البيانات أو Cloudflare KV باستخدام uniqueKey
  if (!uniqueKey || uniqueKey === 'unknown-session') return [];

  // محاكاة مؤقتة
  return [
    {
      id: 'cart-1',
      productId: '1',
      name: 'منتج 1',
      price: 10000, // بالسنت (100 جنيه)
      quantity: 2,
      image: '/images/default-product.png',
      maxStock: 10,
    },
  ];
}

/**
 * جلب بيانات العميل الشخصية (معلومات حساسة - ممنوع الكاش نهائياً)
 */
async function fetchCustomerData(customerId?: string): Promise<CustomerData | null> {
  if (!customerId) return null;

  // TODO: استبدال بـ D1 الفعلي
  return {
    id: customerId,
    name: 'أحمد محمد',
    email: 'ahmed@example.com',
    phone: '01012345678',
    address: {
      street: 'شارع النيل',
      city: 'القاهرة',
      country: 'مصر',
      postalCode: '11511',
    },
  };
}

// ============================================================
// 💾 دوال جلب البيانات الثابتة (تم إصلاح الـ keyParts للتوافق مع TypeScript)
// ============================================================

/**
 * جلب خيارات الشحن (مكشّرة بأمان لأنها عامة لكل زوار المتجر)
 */
const getCachedShippingOptions = unstable_cache(
  async (storeId: string): Promise<ShippingOption[]> => {
    // TODO: جلب الخيارات من D1 بناءً على storeId
    return [
      {
        id: 'standard',
        name: 'شحن قياسي',
        description: 'يصل خلال 3-5 أيام عمل',
        price: 5000, // 50 جنيه
        estimatedDays: 5,
      },
      {
        id: 'express',
        name: 'شحن سريع',
        description: 'يصل خلال 1-2 أيام عمل',
        price: 15000, // 150 جنيه
        estimatedDays: 2,
      },
    ];
  },
  ['shipping-options'], // ✅ تم التعديل هنا: مصفوفة نصوص ثابتة فقط
  { revalidate: 300, tags: ['shipping-options'] } // كاش لمدة 5 دقائق
);

/**
 * جلب طرق الدفع (مكشّرة بأمان)
 */
const getCachedPaymentMethods = unstable_cache(
  async (storeId: string): Promise<PaymentMethod[]> => {
    // TODO: جلب الطرق المفعلة من D1
    return [
      {
        id: 'cod',
        name: 'الدفع عند الاستلام',
        type: 'cod',
        description: 'ادفع نقداً عند تسليم الطلب',
        enabled: true,
      },
      {
        id: 'card',
        name: 'بطاقة ائتمان',
        type: 'card',
        description: 'فيزا / ماستركارد / ميزة',
        enabled: true,
      },
    ];
  },
  ['payment-methods'], // ✅ تم التعديل هنا: مصفوفة نصوص ثابتة فقط
  { revalidate: 300, tags: ['payment-methods'] }
);

// ============================================================
// 🧠 الـ Composer الرئيسي لصفحة الدفع (آمن ومجمّع بالتوازي)
// ============================================================

export async function getCheckoutRawData(
  storeId: string,
  customerId?: string,
  sessionId?: string
): Promise<CheckoutRawData> {
  if (!storeId) {
    throw new Error('[CheckoutDataFetcher] storeId is required');
  }

  const uniqueUserKey = customerId || sessionId || 'unknown-session';

  try {
    // 🚀 جلب البيانات بالتوازي لسرعة خارقة (بين المكشّر والحي)
    const [cartItems, customer, shippingOptions, paymentMethods] = await Promise.all([
      fetchCartItems(uniqueUserKey, storeId),
      fetchCustomerData(customerId),
      getCachedShippingOptions(storeId),
      getCachedPaymentMethods(storeId),
    ]);

    return {
      cartItems,
      customer,
      shippingOptions,
      paymentMethods,
      storeId,
      currency: 'EGP',
    };
  } catch (error) {
    console.error('[CheckoutDataFetcher] Critical Error:', error);
    throw new Error('فشل في تحميل بيانات إتمام الطلب. يرجى المحاولة لاحقاً.');
  }
}

/**
 * جلب الـ Session ID من الـ Cookies بأمان
 */
export async function getSessionId(): Promise<string> {
  const cookieStore = await cookies();
  let id = cookieStore.get('session_id')?.value;
  
  if (!id) {
    id = crypto.randomUUID();
    // تذكر في السيرفر أكشن أو الميدل وير تعيين هذا الكوكي للمستخدم الضيف
  }
  return id;
}