import { drizzle } from 'drizzle-orm/d1';
import { eq, and, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { Env } from '@/lib/env';

// 📂 استيراد السكيمات الفعلية المتاحة في مشروعك
import { stores } from '@/lib/db/schema/stores';
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
  price: number; // بالجنيه (EGP)
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
// 🔌 الحصول على اتصال D1
// ============================================================

function getDb(env: Env) {
  if (!env.DB) {
    console.error('❌ [getDb] D1 Database binding (DB) is missing from env');
    throw new Error('D1 Database binding not available');
  }
  return drizzle(env.DB);
}

// ============================================================
// 🍪 إدارة الجلسة (Session Helpers)
// ============================================================

/**
 * جلب معرف الجلسة الحالية (Session ID) من الـ Cookies
 */
export async function getSessionId(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('session_id')?.value;
  } catch (error) {
    console.error('❌ [getSessionId] Failed to read cookies:', error);
    return undefined;
  }
}

// ============================================================
// 🗄️ دوال جلب البيانات
// ============================================================

/**
 * جلب بيانات المتجر والتأكد من وجوده
 */
async function fetchStoreCurrency(storeId: string, env: Env): Promise<string> {
  try {
    const db = getDb(env);
    const store = await db
      .select({ id: stores.id, currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, storeId))
      .get();

    return store?.currency ?? 'EGP';
  } catch (error) {
    console.error('❌ [fetchStoreCurrency] Error:', error);
    return 'EGP';
  }
}

/**
 * جلب خيارات الشحن المتاحة للمتجر
 */
async function fetchShippingOptions(storeId: string, env: Env): Promise<ShippingOption[]> {
  try {
    const db = getDb(env);

    // التحقق من أن المتجر موجود ويعمل
    const activeStore = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
      .get();

    if (!activeStore) return [];

    // خيارات الشحن القياسية المتاحة للمتجر (يمكن تخصيص أسعارها لاحقاً حسب المحافظة)
    return [
      {
        id: 'standard',
        name: 'شحن قياسي',
        description: 'التوصيل خلال 2 - 4 أيام عمل',
        price: 50,
        estimatedDays: 3,
      },
      {
        id: 'express',
        name: 'شحن سريع',
        description: 'التوصيل خلال 24 ساعة',
        price: 85,
        estimatedDays: 1,
      },
    ];
  } catch (error) {
    console.error('❌ [fetchShippingOptions] Failed to fetch shipping options:', error);
    return [];
  }
}

/**
 * جلب طرق الدفع المفعلة للمتجر
 */
async function fetchPaymentMethods(storeId: string, env: Env): Promise<PaymentMethod[]> {
  try {
    const db = getDb(env);

    const store = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, storeId))
      .get();

    if (!store) return [];

    // طرق الدفع الافتراضية المفعلة للمتجر
    return [
      {
        id: 'cod',
        name: 'الدفع عند الاستلام',
        type: 'cod',
        description: 'ادفع نقداً عند استلام الطلب',
        enabled: true,
      },
      {
        id: 'card',
        name: 'بطاقة ائتمان / ميزة',
        type: 'card',
        description: 'دفع آمن بالبطاقات البنكية',
        enabled: true,
      },
      {
        id: 'wallet',
        name: 'محفظة إلكترونية (فودافون كاش / إنستا باي)',
        type: 'wallet',
        description: 'الدفع عبر المحافظ الإلكترونية',
        enabled: true,
      },
    ];
  } catch (error) {
    console.error('❌ [fetchPaymentMethods] Failed to fetch payment methods:', error);
    return [];
  }
}

// ============================================================
// 🧠 الـ Composer الرئيسي لصفحة الدفع
// ============================================================

export async function getCheckoutRawData(
  storeId: string,
  env: Env,
  customerId?: string,
  sessionId?: string
): Promise<CheckoutRawData> {
  if (!storeId) {
    throw new Error('[CheckoutDataFetcher] storeId is required');
  }

  try {
    const [currency, shippingOptions, paymentMethods] = await Promise.all([
      fetchStoreCurrency(storeId, env),
      fetchShippingOptions(storeId, env),
      fetchPaymentMethods(storeId, env),
    ]);

    return {
      cartItems: [], // السلة تُقرأ محلياً من cart-store على الـ Client أو عبر الـ Session
      customer: null,
      shippingOptions,
      paymentMethods,
      storeId,
      currency,
    };
  } catch (error) {
    console.error('[CheckoutDataFetcher] Critical Error:', error);
    throw new Error('فشل في تحميل بيانات إتمام الطلب. يرجى المحاولة لاحقاً.');
  }
}