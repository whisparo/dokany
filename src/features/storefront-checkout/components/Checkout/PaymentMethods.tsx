// src/components/storefront/Checkout/PaymentMethods.tsx
'use client';

import { Wallet, CreditCard, Building2, Check } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import type { CheckoutPayload } from './Checkout.adapter';

interface PaymentMethodsProps {
  methods: CheckoutPayload['paymentMethods'];
  selectedId: string;
  onChange: (id: string) => void;
  theme: any;
}

export function PaymentMethods({ methods, selectedId, onChange, theme }: PaymentMethodsProps) {
  if (methods.length === 0) return null;

  return (
    <div className={theme.paymentSection}>
      <Typography variant="h3" className={theme.subTitle}>
        طريقة الدفع
      </Typography>
      <div className={theme.optionsGrid} role="radiogroup" aria-label="طرق الدفع">
        {methods.map((method) => {
          const isSelected = selectedId === method.id;
          return (
            <button
              key={method.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={theme.optionCard(isSelected)}
              onClick={() => onChange(method.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(method.id);
                }
              }}
            >
              <div className="flex items-start gap-3 flex-1 text-start">
                {method.type === 'cod' && <Wallet className="h-5 w-5 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                {method.type === 'card' && <CreditCard className="h-5 w-5 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                {method.type === 'wallet' && <Building2 className="h-5 w-5 mt-0.5 text-muted-foreground" aria-hidden="true" />}
                <div>
                  <Typography variant="body2" weight="medium" className="text-foreground">
                    {method.name}
                  </Typography>
                  {method.description && (
                    <Typography variant="caption" className="text-muted-foreground block mt-1">
                      {method.description}
                    </Typography>
                  )}
                </div>
              </div>
              {isSelected && (
                <Check className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}