// src/features/storefront-order-confirmation/data/order-confirmation-data-fetcher.ts

import { getAppDb } from '@/lib/db/db';
import { orders, orderItems, stores, addresses } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export interface RawOrderConfirmationData {
  order: typeof orders.$inferSelect;
  store: typeof stores.$inferSelect;
  items: (typeof orderItems.$inferSelect)[];
  shippingAddress: typeof addresses.$inferSelect | null;
}

export async function fetchOrderConfirmationData(
  orderId: string,
  storeSlug: string
): Promise<RawOrderConfirmationData | null> {
  const { db } = await getAppDb();

  const store = await db.query.stores.findFirst({
    where: eq(stores.slug, storeSlug),
  });

  if (!store) return null;

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.storeId, store.id)),
  });

  if (!order) return null;

  const [items, rawShippingAddress] = await Promise.all([
    db.query.orderItems.findMany({
      where: eq(orderItems.orderId, order.id),
    }),
    order.addressId
      ? db.query.addresses.findFirst({
          where: eq(addresses.id, order.addressId),
        })
      : Promise.resolve(null),
  ]);

  // 🟢 تحويل القيمة القادمة من undefined إلى null بأسلوب صريح ومضمون
  const shippingAddress = rawShippingAddress ?? null;

  return { order, store, items, shippingAddress };
}