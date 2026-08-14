// src/lib/services/coupon-service.ts

import { eq, and, sql, isNull, count } from 'drizzle-orm';
import { coupons } from '@/lib/db/schema/coupons';
import { orders } from '@/lib/db/schema/orders';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@/lib/db/schema';

export type DB = DrizzleD1Database<typeof schema>;

export interface ValidateCouponInput {
  storeId: string;
  code: string;
  cartTotalAmount: string; // بالقروش (BigInt as string)
  customerId?: string;
  categoryId?: string;
  productId?: string;
}

export interface CouponValidationResult {
  valid: boolean;
  couponId?: string;
  code?: string;
  type?: 'percentage' | 'fixed';
  value?: string;
  calculatedDiscountAmount: string; // بالقروش (BigInt as string)
  finalAmount: string; // بالقروش بعد الخصم
  error?: string;
}

// ============================================================
// 🛡️ Safe BigInt Conversion Helper
// ============================================================
/**
 * تحويل آمن للقيم إلى BigInt
 * يضمن تحويل المدخلات إلى string صريح أولاً لمنع فقدان الدقة الحسابية
 */
function safeBigInt(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  
  // ✅ تحويل القيم لنص صريح دائماً لضمان الدقة المالية
  const strValue = String(value).trim();
  if (!/^\d+$/.test(strValue)) return null; // التحقق من الأرقام فقط

  try {
    return BigInt(strValue);
  } catch {
    return null;
  }
}

export class CouponService {
  constructor(private db: DB) {}

  /**
   * 🔍 التحقق من صحة الكوبون وحساب قيمة الخصم المستحق
   */
  async validateCoupon(input: ValidateCouponInput): Promise<CouponValidationResult> {
    const normalizedCode = input.code.trim().toUpperCase();
    const cartTotal = safeBigInt(input.cartTotalAmount);

    // ✅ حماية من القيم الفاسدة
    if (cartTotal === null || cartTotal <= BigInt(0)) {
      return {
        valid: false,
        calculatedDiscountAmount: '0',
        finalAmount: input.cartTotalAmount || '0',
        error: 'إجمالي السلة غير صالح',
      };
    }

    try {
      // 1. جلب الكوبون من قاعدة البيانات (الكوبونات غير المحذوفة فقط)
      const [coupon] = await this.db
        .select()
        .from(coupons)
        .where(
          and(
            eq(coupons.storeId, input.storeId),
            eq(coupons.code, normalizedCode),
            isNull(coupons.deletedAt)
          )
        )
        .limit(1);

      if (!coupon) {
        return {
          valid: false,
          calculatedDiscountAmount: '0',
          finalAmount: cartTotal.toString(),
          error: 'كود الخصم غير موجود',
        };
      }

      // 2. التحقق من حالة الفعالية (isActive)
      if (!coupon.isActive) {
        return {
          valid: false,
          calculatedDiscountAmount: '0',
          finalAmount: cartTotal.toString(),
          error: 'كود الخصم غير مفعّل',
        };
      }

      // 3. فحص التواريخ (startsAt & expiresAt)
      const now = new Date();
      if (coupon.startsAt && new Date(coupon.startsAt) > now) {
        return {
          valid: false,
          calculatedDiscountAmount: '0',
          finalAmount: cartTotal.toString(),
          error: 'كود الخصم لم يبدأ بعد',
        };
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
        return {
          valid: false,
          calculatedDiscountAmount: '0',
          finalAmount: cartTotal.toString(),
          error: 'كود الخصم منتهي الصلاحية',
        };
      }

      // 4. التحقق من الحد الأقصى للاستخدام الإجمالي (maxUses & usedCount)
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        return {
          valid: false,
          calculatedDiscountAmount: '0',
          finalAmount: cartTotal.toString(),
          error: 'تم استنفاد الحد الأقصى لاستخدام هذا الكوبون',
        };
      }

      // 5. التحقق من الحد الأقصى للاستخدام الشخصي (maxUsesPerCustomer)
      if (input.customerId && coupon.maxUsesPerCustomer > 0) {
        const customerUsageResult = await this.db
          .select({ count: count() })
          .from(orders)
          .where(
            and(
              eq(orders.couponId, coupon.id),
              eq(orders.customerId, input.customerId),
              isNull(orders.deletedAt)
            )
          )
          .get();

        const customerUsageCount = customerUsageResult?.count ?? 0;

        if (customerUsageCount >= coupon.maxUsesPerCustomer) {
          return {
            valid: false,
            calculatedDiscountAmount: '0',
            finalAmount: cartTotal.toString(),
            error: `لقد استخدمت هذا الكوبون ${customerUsageCount} مرات من أصل ${coupon.maxUsesPerCustomer} المسموح بها`,
          };
        }
      }

      // 6. التحقق من الحد الأدنى للطلب (minOrderAmount)
      if (coupon.minOrderAmount) {
        const minOrder = safeBigInt(coupon.minOrderAmount);
        if (minOrder !== null && cartTotal < minOrder) {
          return {
            valid: false,
            calculatedDiscountAmount: '0',
            finalAmount: cartTotal.toString(),
            error: `الحد الأدنى لاستخدام هذا الكوبون هو ${Number(minOrder) / 100} جنيه`,
          };
        }
      }

      // 7. التحقق من شمولية القسم أو المنتج
      if (input.productId && coupon.applicableProducts && coupon.applicableProducts.length > 0) {
        if (!coupon.applicableProducts.includes(input.productId)) {
          return {
            valid: false,
            calculatedDiscountAmount: '0',
            finalAmount: cartTotal.toString(),
            error: 'هذا الكوبون غير متاح للمنتجات المحددة في السلة',
          };
        }
      }

      if (input.categoryId && coupon.applicableCategories && coupon.applicableCategories.length > 0) {
        if (!coupon.applicableCategories.includes(input.categoryId)) {
          return {
            valid: false,
            calculatedDiscountAmount: '0',
            finalAmount: cartTotal.toString(),
            error: 'هذا الكوبون غير متاح لهذا التصنيف',
          };
        }
      }

      // 8. حساب الخصم المستحق بناءً على النوع (fixed أو percentage)
      let discountAmount = BigInt(0);
      const couponValue = safeBigInt(coupon.value);

      // حماية إضافية: لو قيمة الكوبون غير صالحة
      if (couponValue === null || couponValue <= BigInt(0)) {
        return {
          valid: false,
          calculatedDiscountAmount: '0',
          finalAmount: cartTotal.toString(),
          error: 'قيمة الكوبون غير صالحة، يرجى التواصل مع الدعم',
        };
      }

      if (coupon.type === 'fixed') {
        discountAmount = couponValue > cartTotal ? cartTotal : couponValue;
      } else if (coupon.type === 'percentage') {
        discountAmount = (cartTotal * couponValue) / BigInt(100);

        // تطبيق الحد الأقصى للخصم إن وجد (maxDiscountAmount)
        if (coupon.maxDiscountAmount) {
          const maxDiscount = safeBigInt(coupon.maxDiscountAmount);
          if (maxDiscount !== null && discountAmount > maxDiscount) {
            discountAmount = maxDiscount;
          }
        }
      }

      // حماية ألا يتجاوز الخصم إجمالي السلة
      if (discountAmount > cartTotal) {
        discountAmount = cartTotal;
      }

      const finalAmount = cartTotal - discountAmount;

      return {
        valid: true,
        couponId: coupon.id,
        code: coupon.code,
        type: coupon.type as 'percentage' | 'fixed',
        value: String(coupon.value),
        calculatedDiscountAmount: discountAmount.toString(),
        finalAmount: finalAmount.toString(),
      };
    } catch (error: unknown) {
      // ✅ Type-safe catch block مع فحص نوع الخطأ
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown coupon validation error';
      console.error('[CouponService] Unexpected error during validation:', errorMessage);

      return {
        valid: false,
        calculatedDiscountAmount: '0',
        finalAmount: cartTotal.toString(),
        error: 'حدث خطأ أثناء التحقق من الكوبون، يرجى المحاولة مرة أخرى',
      };
    }
  }

  /**
   * 📈 زيادة عداد استخدام الكوبون (usedCount) بعد إتمام الطلب بنجاح
   */
  async incrementUsage(couponId: string): Promise<void> {
    await this.db
      .update(coupons)
      .set({
        usedCount: sql`${coupons.usedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(coupons.id, couponId));
  }
}