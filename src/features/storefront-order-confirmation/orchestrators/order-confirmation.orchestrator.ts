//src/features/storefront-order-confirmation/orchestrators/order-confirmation.orchestrator.ts

import { fetchOrderConfirmationData } from '../data/order-confirmation-data-fetcher';
import { adaptOrderConfirmationPage, type OrderConfirmationViewModel } from '../adapters/order-confirmation-page.adapter';

export async function getOrderConfirmationViewModel(
  orderId: string,
  storeSlug: string
): Promise<OrderConfirmationViewModel | null> {
  const rawData = await fetchOrderConfirmationData(orderId, storeSlug);
  if (!rawData) return null;

  return adaptOrderConfirmationPage(rawData);
}