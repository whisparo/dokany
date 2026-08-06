// src/components/storefront/Checkout/OrderSummary.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import Button from '@/components/shared/Button';
import { cn } from '@/lib/utils';
import type { CheckoutPayload } from './Checkout.adapter';

interface OrderSummaryProps {
  payload: CheckoutPayload;
  selectedPaymentId: string;
  isSubmitting: boolean;
  theme: any;
}

export function OrderSummary({ payload, selectedPaymentId, isSubmitting, theme }: OrderSummaryProps) {
  const selectedPayment = payload.paymentMethods.find((p) => p.id === selectedPaymentId);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  return (
    <div className={theme.summaryCard}>
      {/* 🎒 رأس الكارت الأنيق */}
      <div className="flex items-center gap-3 border-b border-border/10 pb-4 mb-6">
        <div className="p-2 rounded-xl bg-primary/10 text-primary">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <Typography variant="h2" weight="bold" className="text-xl text-foreground m-0">
          ملخص الطلب
        </Typography>
      </div>

      {/* 📦 قائمة المنتجات */}
      <div className={theme.cartItems}>
        {payload.cartItems.map((item) => {
          const hasImageError = imageErrors[item.id];

          return (
            <div key={item.id} className={theme.cartItem}>
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* حاوية الصورة الزجاجية الناعمة */}
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-muted/40 border border-border/20 relative flex items-center justify-center">
                  {hasImageError || !item.image ? (
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/20 flex items-center justify-center text-xs text-primary/60 font-black">
                      {item.name.substring(0, 2)}
                    </div>
                  ) : (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="56px"
                      className="object-cover transition-transform duration-300 hover:scale-105"
                      onError={() => {
                        setImageErrors((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    />
                  )}
                  {/* شارة صغيرة رائعة للكمية فوق الصورة مباشرة */}
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                    {item.quantity}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <Typography variant="body2" weight="bold" className="truncate text-foreground/90">
                    {item.name}
                  </Typography>
                  <Typography variant="caption" className="text-muted-foreground/70 font-medium">
                    سعر القطعة: {item.formattedPrice}
                  </Typography>
                </div>
              </div>

              {/* السعر الإجمالي للسطر بالكامل */}
              <Typography variant="body2" weight="bold" className="shrink-0 text-foreground font-mono font-black">
                {item.formattedLineTotal}
              </Typography>
            </div>
          );
        })}
      </div>

      {/* 💰 الحسابات المالية الفورية بالتنسيق النيوني الناعم */}
      <div className={theme.summaryDetails}>
        <div className={theme.summaryRow}>
          <span className="text-muted-foreground/80">المجموع الفرعي</span>
          <span className="font-semibold text-foreground font-mono">{payload.summary.formattedSubtotal}</span>
        </div>
        
        <div className={theme.summaryRow}>
          <span className="text-muted-foreground/80">الشحن</span>
          <span className="font-semibold text-primary font-mono bg-primary/5 px-2.5 py-0.5 rounded-full text-xs">
            {payload.summary.formattedShippingCost}
          </span>
        </div>

        <div className={theme.summaryRow}>
          <span className="text-muted-foreground/60 text-xs">الضريبة (14% مشمولة)</span>
          <span className="font-medium text-xs text-muted-foreground/80 font-mono">
            {payload.summary.formattedTax}
          </span>
        </div>

        {payload.summary.discount > 0 && (
          <div className={cn(theme.summaryRow, 'text-emerald-500 bg-emerald-500/5 px-3 py-1.5 rounded-xl border border-emerald-500/10')}>
            <span className="font-medium">الخصم المطبق</span>
            <span className="font-bold font-mono">-{payload.summary.formattedDiscount}</span>
          </div>
        )}
        
        {/* صندوق الإجمالي المشع والفاخر للغاية */}
        <div className="border-t border-border/10 mt-6 pt-5">
          <div className="flex items-center justify-between bg-gradient-to-r from-primary/[0.04] to-primary/[0.01] dark:from-primary/[0.08] p-4 rounded-2xl border border-primary/10 shadow-[0_4px_20px_rgba(var(--primary-rgb),0.02)]">
            <span className="text-sm font-black text-foreground/85">الإجمالي النهائي</span>
            <span className="text-2xl font-black text-primary font-mono tracking-tight drop-shadow-[0_2px_12px_rgba(var(--primary-rgb),0.2)]">
              {payload.summary.formattedTotal}
            </span>
          </div>
        </div>
      </div>

      {/* 🚀 زر الإرسال المتوهج بألوان حيوية تسرق العين */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className={cn(
          theme.submitButton, 
          "relative overflow-hidden group w-full py-4 rounded-2xl font-bold transition-all duration-300",
          "bg-gradient-to-r from-primary via-indigo-600 to-primary text-primary-foreground",
          "hover:opacity-95 hover:shadow-[0_8px_30px_rgba(99,102,241,0.3)] hover:scale-[1.01] active:scale-[0.99]"
        )}
        loading={isSubmitting}
        disabled={isSubmitting || payload.cartItems.length === 0}
      >
        <span className="relative z-10 flex items-center justify-center gap-2 font-black tracking-wide text-white">
          {isSubmitting ? 'جاري تأكيد طلبك الفاخر...' : 'تأكيد وإتمام الطلب'}
        </span>
        {/* تأثير الـ Hover اللامع الانسيابي */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.8s_infinite] pointer-events-none" />
      </Button>

      {/* 🔔 تنبيه الدفع عند الاستلام الأنيق جداً */}
      {selectedPayment?.type === 'cod' && (
        <div className={cn(theme.codNote, "mt-4 bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl flex gap-3")}>
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <Typography variant="caption" weight="bold" className="text-amber-800 dark:text-amber-300 block">
              طريقة الدفع: نقداً عند الاستلام
            </Typography>
            <Typography variant="caption" className="text-amber-700/80 dark:text-amber-400/80 leading-relaxed block text-[11px] sm:text-xs">
              يرجى تجهيز المبلغ المذكور أعلاه عند وصول المندوب. يرجى إبقاء هاتفك متاحاً لتأكيد عنوان الشحن.
            </Typography>
          </div>
        </div>
      )}
    </div>
  );
}