//src/features/storefront-order-confirmation/components/OrderConfirmation/OrderItemsList.tsx

import React from 'react';

interface Item {
  id: string;
  productTitle: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  variantName?: string;
}

interface OrderItemsListProps {
  items: Item[];
  currency: string;
}

export const OrderItemsList: React.FC<OrderItemsListProps> = ({
  items,
  currency,
}) => {
  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
      <h2 className="text-lg font-bold text-gray-900 border-b pb-3">
        المنتجات المطلوبة ({items.length})
      </h2>

      <div className="divide-y">
        {items.map((item) => (
          <div
            key={item.id}
            className="py-3 flex items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <p className="font-semibold text-gray-800">{item.productTitle}</p>
              {item.variantName && (
                <p className="text-xs text-gray-500">النوع: {item.variantName}</p>
              )}
              <p className="text-xs text-gray-500">
                الكمية: {item.quantity} × {item.unitPrice} {currency}
              </p>
            </div>

            <div className="font-bold text-gray-900 text-sm">
              {item.totalPrice} {currency}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};