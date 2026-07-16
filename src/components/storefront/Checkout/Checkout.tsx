// src/components/storefront/Checkout/Checkout.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import { getCheckoutTheme } from './Checkout.theme';
import { adaptCheckout } from './Checkout.adapter';
import { ShippingOptions } from './ShippingOptions';
import { PaymentMethods } from './PaymentMethods';
import { OrderSummary } from './OrderSummary';
import { CheckoutForm } from './CheckoutForm'; 
import type { CheckoutRawData } from '@/lib/data/checkout-data-fetcher';
import { cn } from '@/lib/utils';

export interface CheckoutProps {
  rawData: CheckoutRawData;
  className?: string;
  onSubmit?: (data: {
    customer: any;
    shippingId: string;
    paymentId: string;
  }) => Promise<void>;
}

export function Checkout({ rawData, className, onSubmit }: CheckoutProps) {
  const theme = getCheckoutTheme();

  const [formData, setFormData] = useState({
    name: rawData.customer?.name || '',
    email: rawData.customer?.email || '',
    phone: rawData.customer?.phone || '',
    street: rawData.customer?.address?.street || '',
    city: rawData.customer?.address?.city || '',
    country: rawData.customer?.address?.country || 'مصر',
    postalCode: rawData.customer?.address?.postalCode || '',
  });

  const [selectedShippingId, setSelectedShippingId] = useState(rawData.shippingOptions[0]?.id || '');
  const [selectedPaymentId, setSelectedPaymentId] = useState(rawData.paymentMethods[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (rawData.shippingOptions?.[0] && !selectedShippingId) {
      setSelectedShippingId(rawData.shippingOptions[0].id);
    }
    if (rawData.paymentMethods?.[0] && !selectedPaymentId) {
      setSelectedPaymentId(rawData.paymentMethods[0].id);
    }
  }, [rawData, selectedShippingId, selectedPaymentId]);

  const payload = useMemo(() => {
    return adaptCheckout(rawData, selectedShippingId, rawData.currency);
  }, [rawData, selectedShippingId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (submitError) setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    if (!formData.name || !formData.phone || !formData.street) {
      setSubmitError('يرجى ملء جميع الحقول الإلزامية المميزة بنجمة (*).');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit?.({
        customer: formData,
        shippingId: selectedShippingId,
        paymentId: selectedPaymentId,
      });
    } catch (error: any) {
      setSubmitError(error?.message || 'حدث خطأ أثناء معالجة الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn(theme.container, className)} noValidate>
      <div className={theme.grid}>
        
        {/* 📋 العمود الأيمن: تجميع البيانات والخيارات في تدفق واحد مريح بصرياً */}
        <div className={theme.formColumn}>
          
          {submitError && (
            <div className="mb-6 p-4 rounded-2xl bg-destructive/5 border border-destructive/10 flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <Typography variant="body2" weight="medium">{submitError}</Typography>
            </div>
          )}

          {/* 🌟 السر هنا: جمعنا كل الفوضى السابقة داخل كرت زجاجي واحد موحد (Master Card Layout) */}
          <div className="bg-card/40 dark:bg-card/15 border border-border/30 rounded-[2rem] p-6 sm:p-10 backdrop-blur-xl shadow-[0_15px_40px_rgba(0,0,0,0.02)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.2)] space-y-10">
            
            {/* قسم بيانات الشحن */}
            <div>
              <CheckoutForm 
                formData={formData} 
                onChange={handleInputChange} 
                theme={{
                  ...theme,
                  // إلغاء كلاس الـ formGrid المشتت لعدم تكرار الحدود والكروت
                  formGrid: 'grid grid-cols-1 gap-5 sm:grid-cols-2'
                }} 
              />
            </div>

            {/* خط فاصل ناعم وشفاف بدلاً من الحدود الصلبة */}
            <div className="h-[1px] bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            {/* قسم طريقة الشحن */}
            <div>
              <ShippingOptions 
                options={payload.shippingOptions} 
                selectedId={selectedShippingId} 
                currency={rawData.currency} 
                onChange={setSelectedShippingId} 
                theme={{
                  ...theme,
                  shippingSection: 'space-y-4' // إلغاء كود الكارد الخلفي المكرر
                }} 
              />
            </div>

            <div className="h-[1px] bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            {/* قسم طريقة الدفع */}
            <div>
              <PaymentMethods 
                methods={payload.paymentMethods}
                selectedId={selectedPaymentId} 
                onChange={setSelectedPaymentId} 
                theme={{
                  ...theme,
                  paymentSection: 'space-y-4' // إلغاء كود الكارد الخلفي المكرر
                }} 
              />
            </div>

          </div>
        </div>

        {/* 💰 العمود الأيسر: ملخص الفاتورة الزجاجي الثابت والملازم لحركة العين */}
        <div className={theme.summaryColumn}>
          <OrderSummary 
            payload={payload} 
            selectedPaymentId={selectedPaymentId} 
            isSubmitting={isSubmitting} 
            theme={theme} 
          />
        </div>

      </div>
    </form>
  );
}