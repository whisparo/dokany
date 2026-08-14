// src/components/storefront/Checkout/ShippingOptions.tsx

'use client';

import { Truck, Check } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import type { CheckoutPayload } from './Checkout.adapter';
import type { CheckoutTheme } from './Checkout.theme';

interface ShippingOptionsProps {
  options: CheckoutPayload['shippingOptions'];
  selectedId: string;
  currency: string;
  onChange: (id: string) => void;
  theme: CheckoutTheme;
}

export function ShippingOptions({ 
  options, 
  selectedId, 
  currency, 
  onChange, 
  theme 
}: ShippingOptionsProps) {
  if (!options || options.length === 0) return null;

  return (
    <div className={theme.shippingSection}>
      <Typography variant="h3" className={theme.subTitle}>
        طريقة الشحن
      </Typography>
      <div className={theme.optionsGrid} role="radiogroup" aria-label="خيارات الشحن">
        {options.map((option) => {
          const isSelected = selectedId === option.id;

          // ✅ معالجة آمنة لتنسيق السعر لتجنب أخطاء Invalid Currency Code
          let optionPriceFormatted = 'مجاني';
          if (option.price > 0) {
            try {
              optionPriceFormatted = new Intl.NumberFormat('ar-EG', {
                style: 'currency',
                currency: currency || 'EGP',
                minimumFractionDigits: 0,
              }).format(option.price / 100);
            } catch {
              // Fallback في حالة وجود رمز عملة غير مدعوم
              optionPriceFormatted = `${option.price / 100} ${currency}`;
            }
          }

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={theme.optionCard(isSelected)}
              onClick={() => onChange(option.id)}
            >
              <div className="flex items-start gap-3 flex-1 text-start">
                <Truck className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                <div>
                  <Typography variant="body2" weight="medium" className="text-foreground">
                    {option.name}
                  </Typography>
                  {option.description && (
                    <Typography variant="caption" className="text-muted-foreground block mt-1">
                      {option.description}
                    </Typography>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <Typography variant="body2" weight="bold" className="text-foreground">
                  {optionPriceFormatted}
                </Typography>
                {isSelected && (
                  <Check className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}