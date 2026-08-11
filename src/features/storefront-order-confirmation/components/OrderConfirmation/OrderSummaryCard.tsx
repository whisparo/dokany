//src/features/storefront-order-confirmation/components/OrderConfirmation/OrderSummaryCard.tsx

import React from 'react';

interface OrderSummaryCardProps {
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  currency: string;
}

export const OrderSummaryCard: React.FC<OrderSummaryCardProps> = ({
  subtotal,
  shippingFee,
  totalAmount,
  currency,
}) => {
  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-gray-900 border-b pb-3">
        ملخص الحساب
      </h2>

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex justify-between">
          <span>المجموع الفرعي</span>
          <span className="font-medium text-gray-900">
            {subtotal} {currency}
          </span>
        </div>

        <div className="flex justify-between">
          <span>رسوم الشحن</span>
          <span className="font-medium text-gray-900">
            {shippingFee === 0 ? 'مجاني' : `${shippingFee} ${currency}`}
          </span>
        </div>

        <div className="border-t pt-3 flex justify-between font-bold text-base text-gray-900">
          <span>الإجمالي الكلي</span>
          <span className="text-emerald-600">
            {totalAmount} {currency}
          </span>
        </div>
      </div>
    </div>
  );
};