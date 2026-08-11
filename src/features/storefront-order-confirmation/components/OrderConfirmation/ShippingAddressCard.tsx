//src/features/storefront-order-confirmation/components/OrderConfirmation/ShippingAddressCard.tsx

import React from 'react';

interface ShippingAddressCardProps {
  customerName: string;
  customerPhone: string;
  addressText: string;
}

export const ShippingAddressCard: React.FC<ShippingAddressCardProps> = ({
  customerName,
  customerPhone,
  addressText,
}) => {
  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm space-y-2">
      <h2 className="text-lg font-bold text-gray-900 border-b pb-3">
        تفاصيل الشحن والتوصيل
      </h2>

      <div className="text-sm text-gray-700 space-y-1 pt-2">
        <p className="font-medium text-gray-900">{customerName}</p>
        <p dir="ltr" className="text-right text-gray-600">
          {customerPhone}
        </p>
        <p className="text-gray-600 leading-relaxed">{addressText}</p>
      </div>
    </div>
  );
};