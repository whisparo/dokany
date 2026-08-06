// src/components/storefront/Checkout/ShippingOptions.tsx
'use client';

import { Truck, Check } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import type { CheckoutPayload } from './Checkout.adapter';

interface ShippingOptionsProps {
  options: CheckoutPayload['shippingOptions'];
  selectedId: string;
  currency: string;
  onChange: (id: string) => void;
  theme: any;
}

export function ShippingOptions({ options, selectedId, currency, onChange, theme }: ShippingOptionsProps) {
  if (options.length === 0) return null;

  return (
    <div className={theme.shippingSection}>
      <Typography variant="h3" className={theme.subTitle}>
        طريقة الشحن
      </Typography>
      <div className={theme.optionsGrid} role="radiogroup" aria-label="خيارات الشحن">
        {options.map((option) => {
          const isSelected = selectedId === option.id;
          
          const optionPriceFormatted = option.price === 0 
            ? 'مجاني' 
            : new Intl.NumberFormat('ar-EG', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 0,
              }).format(option.price / 100);

          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={theme.optionCard(isSelected)}
              onClick={() => onChange(option.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(option.id);
                }
              }}
            >
              <div className="flex items-start gap-3 flex-1 text-start">
                <Truck className="h-5 w-5 mt-0.5 text-muted-foreground" aria-hidden="true" />
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
              <div className="flex flex-col items-end gap-2">
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