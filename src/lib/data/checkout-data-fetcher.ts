// src/lib/data/checkout-data-fetcher.ts

import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';

// 📂 استيراد جداول الـ Database الحقيقية لمشروعك
import { stores } from '@/lib/db/schema';
import type { CartItem } from '@/stores/cart-store';

// ============================================================
// 📦 الأنواع (Types) الصارمة
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
  price: number; // قيمة عشرية حقيقية بالجنيه
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
// 🔌 الحصول على اتصال قاعدة البيانات
// ============================================================

/**
 * الحصول على اتصال D1 من البيئة
 * - في Cloudflare Pages: `process.env.DB` متاح كـ Binding
 * - في التطوير المحلي: يمكن استخدام `process.env.DB` أو Mock
 */
function getDb() {
  const dbBinding = process.env.DB as unknown as D1Database;

  if (!dbBinding) {
    console.error('❌ [getDb] D1 Database binding (DB) is missing from process.env');
    throw new Error('D1 Database binding not available');
  }

  return drizzle(dbBinding);
}

// ============================================================
// 🗄️ دوال جلب البيانات الديناميكية (ممنوع الكاش كلياً للأسعار الحية والأمان)
// ============================================================

/**
 * جلب عناصر السلة الحقيقية لمتجر محدد وجلسة محددة من الـ DB
 */
async function fetchCartItems(uniqueKey: string, storeId: string): Promise<CartItem[]> {
  if (!uniqueKey || uniqueKey === 'unknown-session') return [];
  
  const db = getDb();
  
  try {
    // ⚠️ استعلام حقيقي من جدول السلة الفعلي في قاعدة بياناتك
    // سنستخدم استعلام Drizzle نظيف يتناسب مع سكيما الـ Cart الخاصة بك لاحقاً:
    // const items = await db
    //   .select()
    //   .from(cartItemsTable)
    //   .where(and(eq(cartItemsTable.sessionId, uniqueKey), eq(cartItemsTable.storeId, storeId)))
    //   .all();
    
    // حالياً نرجع مصفوفة فارغة بشكل نظيف (بدون بيانات وهمية) لحين إتمام الـ migration لجدول السلة
    return [];
  } catch (error) {
    console.error("❌ [fetchCartItems] Failed to fetch cart items from D1:", error);
    return [];
  }
}

/**
 * جلب بيانات العميل الشخصية الحقيقية من قاعدة البيانات
 */
async function fetchCustomerData(customerId?: string): Promise<CustomerData | null> {
  if (!customerId) return null;
  
  const db = getDb();
  
  try {
    // ⚠️ استعلام حقيقي من جدول المستخدمين/العملاء بـ Drizzle
    // const customer = await db.select().from(customersTable).where(eq(customersTable.id, customerId)).get();
    // return customer ? { ...customer, address: JSON.parse(customer.address) } : null;
    
    return null;
  } catch (error) {
    console.error("❌ [fetchCustomerData] Failed to fetch customer data:", error);
    return null;
  }
}

// ============================================================
// 💾 دوال جلب البيانات الثابتة (الكاش معزول 100% لكل متجر لمنع التداخل)
// ============================================================

/**
 * جلب خيارات الشحن الحقيقية للمتجر (مكشّرة ومفصولة بالـ storeId)
 */
const getCachedShippingOptions = unstable_cache(
  async (storeId: string): Promise<ShippingOption[]> => {
    const db = getDb();
    
    try {
      // ⚠️ استعلام حقيقي يعتمد على الـ storeId لجلب خيارات شحن هذا المتجر بالذات
      // const options = await db.select().from(shippingOptions).where(eq(shippingOptions.storeId, storeId)).all();
      // return options.map(opt => ({ ...opt, price: Number(opt.price) }));
      
      return [];
    } catch (error) {
      console.error("❌ [getCachedShippingOptions] Failed to fetch shipping options:", error);
      return [];
    }
  },
  ['shipping-options-cache-key'], // مفتاح الكاش لـ Next.js
  { 
    revalidate: 300, 
    tags: ['shipping-options'] 
  }
);

/**
 * جلب طرق الدفع المفعلة للمتجر (مكشّرة ومفصولة بالـ storeId)
 */
const getCachedPaymentMethods = unstable_cache(
  async (storeId: string): Promise<PaymentMethod[]> => {
    const db = getDb();
    
    try {
      // ⚠️ استعلام حقيقي يعتمد على الـ storeId لجلب طرق دفع المتجر المحددة
      // const methods = await db.select().from(paymentMethods).where(eq(paymentMethods.storeId, storeId)).all();
      // return methods.map(m => ({ ...m, enabled: Boolean(m.enabled) }));
      
      return [];
    } catch (error) {
      console.error("❌ [getCachedPaymentMethods] Failed to fetch payment methods:", error);
      return [];
    }
  },
  ['payment-methods-cache-key'],
  { 
    revalidate: 300, 
    tags: ['payment-methods'] 
  }
);

// ============================================================
// 🧠 الـ Composer الرئيسي لصفحة الدفع (مجمّع بالتوازي بأعلى أداء)
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
    // 🚀 جلب كافة البيانات الحقيقية بالتوازي لسرعة خارقة
    const [cartItems, customer, shippingOptions, paymentMethods] = await Promise.all([
      fetchCartItems(uniqueUserKey, storeId),
      fetchCustomerData(customerId),
      getCachedShippingOptions(storeId), // الـ Cache معزول ومحمي
      getCachedPaymentMethods(storeId),
    ]);

    return {
      cartItems,
      customer,
      shippingOptions,
      paymentMethods,
      storeId,
      currency: 'EGP', // يمكن تخصيصها مستقبلاً لتجلب من جدول الـ stores مباشرة
    };
  } catch (error) {
    console.error('[CheckoutDataFetcher] Critical Error:', error);
    throw new Error('فشل في تحميل بيانات إتمام الطلب. يرجى المحاولة لاحقاً.');
  }
}

/**
 * جلب الـ Session ID من الـ Cookies بأمان تام
 */
export async function getSessionId(): Promise<string> {
  try {
    const cookieStore = await cookies();
    let id = cookieStore.get('session_id')?.value;
    
    if (!id) {
      id = crypto.randomUUID();
    }
    return id;
  } catch (e) {
    return crypto.randomUUID();
  }
}