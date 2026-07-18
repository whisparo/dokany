// app/(storefront)/[storeSlug]/checkout/checkout.actions.ts
'use server';

import { redirect } from 'next/navigation';

export async function handleCheckoutSubmit(
  storeSlug: string,
  data: {
    customer: any;
    shippingId: string;
    paymentId: string;
  }
) {
  console.log('[Server Action] Order submitted successfully:', data);
  redirect(`/${storeSlug}/order-confirmation`);
}