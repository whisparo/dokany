// src/components/storefront/Checkout/PaymentMethods.tsx
'use client';

import { Wallet, CreditCard, Building2, HelpCircle, Check } from 'lucide-react';
import { Typography } from '@/components/shared/Typography';
import type { CheckoutPayload } from './Checkout.adapter';
import type { CheckoutTheme } from './Checkout.theme';

interface PaymentMethodsProps {
  methods: CheckoutPayload['paymentMethods'];
  selectedId: string;
  onChange: (id: string) => void;
  theme: CheckoutTheme;
}

export function PaymentMethods({ methods, selectedId, onChange, theme }: PaymentMethodsProps) {
  if (!methods || methods.length === 0) return null;

  // 🛠️ دالة مساعدة لاختيار الأيقونة المناسبة
  const renderPaymentIcon = (type: string) => {
    const iconClass = "h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0";
    switch (type) {
      case 'cod':
        return <Wallet className={iconClass} aria-hidden="true" />;
      case 'card':
        return <CreditCard className={iconClass} aria-hidden="true" />;
      case 'wallet':
        return <Building2 className={iconClass} aria-hidden="true" />;
      default:
        return <HelpCircle className={iconClass} aria-hidden="true" />;
    }
  };

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
              className={theme.optionCard(isSelected)}
              onClick={() => onChange(method.id)}
            >
              <div className="flex items-start gap-3 flex-1 text-start">
                {renderPaymentIcon(method.type)}
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
                <Check className="h-5 w-5 text-primary-600 dark:text-primary-400 flex-shrink-0" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}