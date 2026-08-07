// src/components/storefront/Checkout/Checkout.tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import  Button  from '@/components/shared/Button';
import { getCheckoutTheme } from './Checkout.theme';
import { adaptCheckout } from './Checkout.adapter';
import { ShippingOptions } from './ShippingOptions';
import { PaymentMethods } from './PaymentMethods';
import { OrderSummary } from './OrderSummary';
import { CheckoutForm } from './CheckoutForm'; 
import type { CheckoutRawData } from '@/features/storefront-checkout/data/checkout-data-fetcher';
import { useCartStore } from '@/stores/cart-store';
import { cn } from '@/lib/utils';

export interface CheckoutProps {
  rawData: CheckoutRawData;
  className?: string;
  onSubmit?: (data: {
    customer: {
      name: string;
      phone: string;
      email?: string;
    };
    shippingAddress: {
      recipientName: string;
      recipientPhone: string;
      country: string;
      city: string;
      street: string;
      building?: string;
      floor?: string;
      apartment?: string;
    };
    items: any[];
    shippingCost: number;
    paymentMethod: string;
    shippingMethod: string;
    currency: string;
  }) => Promise<void>;
}

export function Checkout({ rawData, className, onSubmit }: CheckoutProps) {
  const theme = getCheckoutTheme();
  
  // 🟢 1. تعديل الخطأ: useRouter بدلاً من Router()
  const router = useRouter();
  
  // 🛒 2. قراءة بيانات السلة الفعلية من Zustand Store
  const { items: cartItems, clearCart } = useCartStore();

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

  // 🟢 3. إعداد بيانات السلة بتسوية المسميات مع CartItem مع حماية TypeScript
  const effectiveRawData = useMemo(() => {
    return {
      ...rawData,
      cartItems: cartItems.map((item: any) => ({
        productId: item.productId,
        sku: item.sku || 'DEFAULT-SKU',
        name: item.name,
        price: item.price,
        originalPrice: item.price,
        quantity: item.quantity,
        image: item.image,
        options: item.options || {},
      })) as any,
    };
  }, [rawData, cartItems]);

  const payload = useMemo(() => {
    return adaptCheckout(effectiveRawData, selectedShippingId, rawData.currency);
  }, [effectiveRawData, selectedShippingId, rawData.currency]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (submitError) setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    // 🛑 التحقق من وجود منتجات في السلة
    if (!cartItems || cartItems.length === 0) {
      setSubmitError('سلة التسوق فارغة. يرجى إضافة منتجات أولاً قبل الدفع.');
      return;
    }

    if (!formData.name || !formData.phone || !formData.street) {
      setSubmitError('يرجى ملء جميع الحقول الإلزامية المميزة بنجمة (*).');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedShippingOption = rawData.shippingOptions.find(
        (opt) => opt.id === selectedShippingId
      );

      const rawShipping = selectedShippingOption as any;
      const shippingCost = typeof rawShipping?.price === 'number' 
        ? rawShipping.price 
        : Number(rawShipping?.price || 0);

      const shippingMethod = rawShipping?.type || rawShipping?.method || selectedShippingId || 'standard';

      // 🟢 4. تحويل عناصر السلة للـ Server Action بدون أخطاء TypeScript
      const formattedItems = cartItems.map((item: any) => {
        const itemSku = item.sku || 'DEFAULT-SKU';
        const itemPrice = Number(item.price || 0);

        return {
          productId: item.productId,
          variantSku: itemSku,
          productName: item.name || 'منتج',
          productSku: itemSku,
          productSlug: item.productId,
          productImage: item.image || '',
          productOptions: item.options || {},
          orderedQty: Number(item.quantity || 1),
          price: itemPrice.toString(),
          originalPrice: itemPrice.toString(),
          discount: '0',
        };
      });

      // 🚀 إرسال الطلب
      await onSubmit?.({
        customer: {
          name: formData.name,
          phone: formData.phone,
          email: formData.email || undefined,
        },
        shippingAddress: {
          recipientName: formData.name,
          recipientPhone: formData.phone,
          country: formData.country,
          city: formData.city,
          street: formData.street,
        },
        items: formattedItems,
        shippingCost,
        paymentMethod: selectedPaymentId,
        shippingMethod,
        currency: rawData.currency || 'EGP',
      });

      // 🎉 تفريغ السلة والتوجيه لصفحة النجاح
      clearCart();
      router.push('/order-success');
    } catch (error: any) {
      setSubmitError(error?.message || 'حدث خطأ أثناء معالجة الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 🛒 واجهة السلة الفارغة
  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-10 h-10" />
        </div>
        <Typography variant="h3" weight="bold" className="mb-2">
          سلة التسوق فارغة
        </Typography>
        <Typography variant="body1" color="muted" className="mb-8 max-w-md">
          لم تقم بإضافة أي منتجات إلى سلتك بعد. تصفح المتجر واضف منتجاتك المفضلة لبدء عملية الشراء.
        </Typography>
        <Button onClick={() => router.push('/')} size="lg">
          العودة للتسوق
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn(theme.container, className)} noValidate>
      <div className={theme.grid}>
        
        {/* 📋 العمود الأيمن */}
        <div className={theme.formColumn}>
          
          {submitError && (
            <div className="mb-6 p-4 rounded-2xl bg-destructive/5 border border-destructive/10 flex items-center gap-3 text-destructive animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <Typography variant="body2" weight="medium">{submitError}</Typography>
            </div>
          )}

          <div className="bg-card/40 dark:bg-card/15 border border-border/30 rounded-[2rem] p-6 sm:p-10 backdrop-blur-xl shadow-[0_15px_40px_rgba(0,0,0,0.02)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.2)] space-y-10">
            
            {/* قسم بيانات الشحن */}
            <div>
              <CheckoutForm 
                formData={formData} 
                onChange={handleInputChange} 
                theme={{
                  ...theme,
                  formGrid: 'grid grid-cols-1 gap-5 sm:grid-cols-2'
                }} 
              />
            </div>

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
                  shippingSection: 'space-y-4'
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
                  paymentSection: 'space-y-4'
                }} 
              />
            </div>

          </div>
        </div>

        {/* 💰 العمود الأيسر: ملخص الطلب */}
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