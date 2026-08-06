// src/components/storefront/Checkout/CheckoutForm.tsx
'use client';

import { Typography } from '@/components/shared/Typography';
import { User, Phone, MapPin } from 'lucide-react';

interface CheckoutFormProps {
  formData: {
    name: string;
    phone: string;
    street: string;
  };
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  theme: any;
}

export function CheckoutForm({ formData, onChange, theme }: CheckoutFormProps) {
  return (
    <div className="space-y-6">
      {/* رأس القسم مع أيقونة ملونة تكسر الجفاف البصري */}
      <div className="flex items-center gap-2 border-b border-primary/10 pb-3">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
          <User className="h-5 w-5" />
        </div>
        <Typography variant="h3" weight="bold" className="text-lg text-foreground m-0">
          بيانات الشحن والتوصيل
        </Typography>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* الاسم الكامل */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5">
            <span>الاسم الكامل</span>
            <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={onChange}
              placeholder="اكتب اسمك الثلاثي"
              className="w-full rounded-xl border border-border/40 bg-card/40 py-3.5 px-4 pr-11 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
              required
            />
            <User className="absolute right-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/40" />
          </div>
        </div>

        {/* رقم الهاتف */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5">
            <span>رقم الهاتف</span>
            <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={onChange}
              placeholder="01xxxxxxxxx"
              className="w-full rounded-xl border border-border/40 bg-card/40 py-3.5 px-4 pr-11 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none text-right"
              required
            />
            <Phone className="absolute right-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/40" />
          </div>
        </div>

        {/* العنوان بالتفصيل */}
        <div className="space-y-2 md:col-span-2">
          <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5">
            <span>العنوان التفصيلي</span>
            <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              name="street"
              value={formData.street}
              onChange={onChange}
              placeholder="اسم الشارع، رقم العمارة، الشقة، أو علامة مميزة"
              className="w-full rounded-xl border border-border/40 bg-card/40 py-3.5 px-4 pr-11 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
              required
            />
            <MapPin className="absolute right-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-muted-foreground/40" />
          </div>
        </div>
      </div>
    </div>
  );
}