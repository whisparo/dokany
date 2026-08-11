import { notFound } from 'next/navigation';
import { getOrderConfirmationViewModel } from '@/features/storefront-order-confirmation/orchestrators/order-confirmation.orchestrator';
import {
  OrderStatusBanner,
  OrderItemsList,
  ShippingAddressCard,
  OrderSummaryCard,
} from '@/features/storefront-order-confirmation/components/OrderConfirmation';

interface OrderConfirmationPageProps {
  params: Promise<{
    storeSlug: string;
  }>;
  searchParams: Promise<{
    orderId?: string;
  }>;
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: OrderConfirmationPageProps) {
  const { storeSlug } = await params;
  const { orderId } = await searchParams;

  if (!orderId) {
    notFound();
  }

  const viewModel = await getOrderConfirmationViewModel(orderId, storeSlug);

  if (!viewModel) {
    notFound();
  }

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <OrderStatusBanner
        orderNumber={viewModel.orderNumber}
        status={viewModel.status}
        createdAt={viewModel.createdAt}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <OrderItemsList
            items={viewModel.items}
            currency={viewModel.currency}
          />

          {viewModel.shippingAddressText && (
            <ShippingAddressCard
              customerName={viewModel.customerName}
              customerPhone={viewModel.customerPhone}
              addressText={viewModel.shippingAddressText}
            />
          )}
        </div>

        <div>
          <OrderSummaryCard
            subtotal={viewModel.subtotal}
            shippingFee={viewModel.shippingFee}
            totalAmount={viewModel.totalAmount}
            currency={viewModel.currency}
          />
        </div>
      </div>
    </main>
  );
}