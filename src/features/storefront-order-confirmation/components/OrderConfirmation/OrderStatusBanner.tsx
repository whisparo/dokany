//src/features/storefront-order-confirmation/components/OrderConfirmation/OrderStatusBanner.tsx

import React from 'react';
import { orderConfirmationTheme } from './OrderConfirmation.theme';

interface OrderStatusBannerProps {
  orderNumber: string;
  status: string;
  createdAt: string;
}

export const OrderStatusBanner: React.FC<OrderStatusBannerProps> = ({
  orderNumber,
  status,
  createdAt,
}) => {
  const statusKey = (status in orderConfirmationTheme.statusBadge
    ? status
    : 'pending') as keyof typeof orderConfirmationTheme.statusBadge;

  const badgeClass = orderConfirmationTheme.statusBadge[statusKey];
  const statusLabel = orderConfirmationTheme.statusText[statusKey];

  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            طلب رقم #{orderNumber}
          </h1>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${badgeClass}`}
          >
            {statusLabel}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">تاريخ الطلب: {createdAt}</p>
      </div>

      <div className="text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 px-4 py-2 rounded-lg text-center">
        🎉 شكرًا لثقتك بنا! تم استلام طلبك وبانتظار التجهيز.
      </div>
    </div>
  );
};

