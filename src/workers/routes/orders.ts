// src/worker/routes/orders.ts

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { safeExecute } from '@/lib/errors/safe-executor';
import type { ProductOptions, NewOrderItem } from '@/lib/db/schema/order-items';

export interface ShippingAddressInput {
  recipientName: string;
  recipientPhone: string;
  country: string;
  city: string;
  street: string;
  area?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  notes?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
}

export interface CreateOrderItemInput {
  productId: string;
  quantity: number;
  price?: string | number;
  options?: ProductOptions;
}

export interface CreateOrderBody {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  addressId?: string;
  shippingAddress: ShippingAddressInput;
  items: CreateOrderItemInput[];
  shippingCost?: string | number;
  taxAmount?: string | number;
  discount?: string | number;
  couponCode?: string;
  couponId?: string;
  paymentMethod?: 'cod' | 'credit_card' | 'wallet' | 'bank_transfer' | 'installments';
  shippingMethod?: 'standard' | 'express' | 'same-day' | 'pickup';
  customerNotes?: string;
}

export interface UpdateOrderStatusBody {
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  cancelReason?: string;
}

interface PreparedOrderItem {
  productId: string;
  productName: string;
  productSku: string;
  productImage: string | null;
  productOptions: ProductOptions;
  quantity: number;
  price: string;
  lineTotal: string;
}

export const ordersRouter = new Hono<{ Bindings: Env }>();

function toCents(amount: string | number | undefined | null): number {
  if (!amount) return 0;
  return Math.round(parseFloat(amount.toString()) * 100);
}

function toFormattedString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * GET /api/store/:slug/orders
 */
ordersRouter.get('/store/:slug/orders', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
    const offset = Number(c.req.query('offset')) || 0;
    const status = c.req.query('status');

    const db = getDb({ DB: c.env.DB });

    const store = await db.select().from(schema.stores).where(eq(schema.stores.slug, slug)).get();
    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const conditions = [
      eq(schema.orders.storeId, store.id),
      sql`${schema.orders.deletedAt} IS NULL`,
    ];
    if (status) conditions.push(eq(schema.orders.status, status));

    const whereClause = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orders)
      .where(whereClause);

    const ordersList = await db
      .select()
      .from(schema.orders)
      .where(whereClause)
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        orders: ordersList,
        pagination: { limit, offset, total: count, hasMore: offset + limit < count },
      },
    });
  })
);

/**
 * GET /api/store/:slug/orders/:id
 */
ordersRouter.get('/store/:slug/orders/:id', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');

    const db = getDb({ DB: c.env.DB });

    const store = await db.select().from(schema.stores).where(eq(schema.stores.slug, slug)).get();
    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const order = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.storeId, store.id),
          sql`${schema.orders.deletedAt} IS NULL`
        )
      )
      .get();

    if (!order) return c.json({ success: false, error: 'Order not found' }, 404);

    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, id));

    return c.json({ success: true, data: { ...order, items } });
  })
);

/**
 * POST /api/store/:slug/orders
 */
ordersRouter.post('/store/:slug/orders', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const body = await c.req.json<CreateOrderBody>();

    // Validation
    if (!body.items || body.items.length === 0) {
      return c.json({ success: false, error: 'Order must have at least one item' }, 400);
    }
    if (!body.customerId) {
      return c.json({ success: false, error: 'Customer ID is required' }, 400);
    }
    if (!body.customerName?.trim() || !body.customerPhone?.trim()) {
      return c.json({ success: false, error: 'Customer name and phone are required' }, 400);
    }
    if (!body.shippingAddress?.recipientName || !body.shippingAddress?.recipientPhone || !body.shippingAddress?.country) {
      return c.json({ success: false, error: 'Shipping address missing required recipient information' }, 400);
    }

    const db = getDb({ DB: c.env.DB });

    const store = await db.select().from(schema.stores).where(eq(schema.stores.slug, slug)).get();
    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const result = await db.transaction(async (tx) => {
      let subtotalCents = 0;
      const preparedItems: PreparedOrderItem[] = [];

      for (const item of body.items) {
        const product = await tx
          .select()
          .from(schema.products)
          .where(and(eq(schema.products.id, item.productId), eq(schema.products.storeId, store.id)))
          .get();

        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Product "${product.name}" has insufficient stock`);
        }

        const productPriceStr = typeof product.price === 'string' ? product.price : String(product.price);
        const unitPriceStr = item.price !== undefined ? String(item.price) : productPriceStr;

        const unitPriceCents = toCents(unitPriceStr);
        const lineTotalCents = unitPriceCents * item.quantity;

        subtotalCents += lineTotalCents;

        let mainImage: string | null = null;
        if (product.images) {
          try {
            const parsedImages = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;
            if (Array.isArray(parsedImages) && parsedImages.length > 0) {
              mainImage = String(parsedImages[0]);
            }
          } catch {
            mainImage = null;
          }
        }

        const sku = product.sku && product.sku.trim() !== '' ? product.sku : `SKU-${product.id.slice(0, 8)}`;

        preparedItems.push({
          productId: product.id,
          productName: product.name,
          productSku: sku,
          productImage: mainImage,
          productOptions: item.options || {},
          quantity: item.quantity,
          price: toFormattedString(unitPriceCents),
          lineTotal: toFormattedString(lineTotalCents),
        });

        // الخصم من المخزون
        await tx
          .update(schema.products)
          .set({ stock: product.stock - item.quantity })
          .where(and(eq(schema.products.id, item.productId), sql`${schema.products.stock} >= ${item.quantity}`));
      }

      const shippingCostCents = toCents(body.shippingCost ?? 0);
      const taxAmountCents = toCents(body.taxAmount ?? 0);
      const discountCents = toCents(body.discount ?? 0);

      // Total Calculation Constraint
      const totalCents = subtotalCents + shippingCostCents + taxAmountCents - discountCents;

      if (totalCents < 0) {
        throw new Error('Calculated order total cannot be negative');
      }

      const orderId = crypto.randomUUID();
      const generatedOrderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. إنشاء الطلب الرئيسي
      const [newOrder] = await tx
        .insert(schema.orders)
        .values({
          id: orderId,
          orderNumber: generatedOrderNumber,
          storeId: store.id,
          customerId: body.customerId,
          addressId: body.addressId ?? null,
          customerName: body.customerName.trim(),
          customerPhone: body.customerPhone.trim(),
          customerEmail: body.customerEmail ?? null,

          shippingAddress: body.shippingAddress,

          currency: 'EGP',
          subtotal: toFormattedString(subtotalCents),
          shippingCost: toFormattedString(shippingCostCents),
          taxAmount: toFormattedString(taxAmountCents),
          discount: toFormattedString(discountCents),
          total: toFormattedString(totalCents),

          couponCode: body.couponCode ?? null,
          couponId: body.couponId ?? null,

          status: 'pending',
          paymentStatus: 'pending',
          paymentMethod: body.paymentMethod ?? 'cod',
          shippingMethod: body.shippingMethod ?? 'standard',
          customerNotes: body.customerNotes ?? null,
        })
        .returning();

      // 2. إنشاء عناصر الطلب باستخدام النمط الصريح Drizzle NewOrderItem
      const orderItemsData: NewOrderItem[] = preparedItems.map((item) => ({
        id: crypto.randomUUID(),
        orderId: newOrder.id,
        productId: item.productId,
        storeId: store.id,
        variantSku: item.productSku,
        productName: item.productName,
        productImage: item.productImage ?? undefined,
        productSku: item.productSku,
        productOptions: item.productOptions,
        orderedQty: item.quantity,
        cancelledQty: 0,
        shippedQty: 0,
        returnedQty: 0,
        price: item.price,
        lineTotal: item.lineTotal,
        originalPrice: item.price,
        haggleDiscount: '0',
        discount: '0',
        taxAmount: '0',
        taxRate: 0,
        taxPercentage: '0',
        shippingCost: '0',
        commissionRate: 0,
        commissionAmount: '0',
        netAmount: item.lineTotal,
        status: 'pending',
        fulfillmentStatus: 'unfulfilled',
        refundAmount: '0',
        metadata: {},
      }));

      await tx.insert(schema.orderItems).values(orderItemsData);

      return { order: newOrder, items: orderItemsData };
    });

    return c.json({ success: true, data: result }, 201);
  })
);

/**
 * PUT /api/store/:slug/orders/:id/status
 */
ordersRouter.put('/store/:slug/orders/:id/status', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const body = await c.req.json<UpdateOrderStatusBody>();

    if (!body.status) return c.json({ success: false, error: 'Status is required' }, 400);

    const db = getDb({ DB: c.env.DB });

    const store = await db.select().from(schema.stores).where(eq(schema.stores.slug, slug)).get();
    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    await db.transaction(async (tx) => {
      const order = await tx
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, id),
            eq(schema.orders.storeId, store.id),
            sql`${schema.orders.deletedAt} IS NULL`
          )
        )
        .get();

      if (!order) throw new Error('Order not found');

      const nowTimestamp = new Date();
      const updateData: Partial<schema.Order> = {
        status: body.status,
        updatedAt: nowTimestamp,
      };

      if (body.status === 'confirmed') updateData.confirmedAt = nowTimestamp;
      if (body.status === 'shipped') updateData.shippedAt = nowTimestamp;
      if (body.status === 'delivered') updateData.deliveredAt = nowTimestamp;

      if (body.status === 'cancelled') {
        updateData.cancelledAt = nowTimestamp;
        updateData.cancelReason = body.cancelReason ?? 'Cancelled by admin/system';

        if (order.status !== 'cancelled') {
          const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id));

          for (const item of items) {
            const restockQty = item.orderedQty - item.shippedQty - item.cancelledQty;

            if (restockQty > 0 && item.productId) {
              await tx
                .update(schema.products)
                .set({ stock: sql`${schema.products.stock} + ${restockQty}` })
                .where(eq(schema.products.id, item.productId));

              await tx
                .update(schema.orderItems)
                .set({
                  cancelledQty: item.orderedQty - item.shippedQty,
                  status: 'cancelled',
                })
                .where(eq(schema.orderItems.id, item.id));
            }
          }
        }
      }

      await tx
        .update(schema.orders)
        .set(updateData)
        .where(eq(schema.orders.id, id));
    });

    return c.json({ success: true, data: { message: `Order status updated to ${body.status}` } });
  })
);

/**
 * DELETE /api/store/:slug/orders/:id (Soft Delete)
 */
ordersRouter.delete('/store/:slug/orders/:id', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');

    const db = getDb({ DB: c.env.DB });

    const store = await db.select().from(schema.stores).where(eq(schema.stores.slug, slug)).get();
    if (!store) return c.json({ success: false, error: 'Store not found' }, 404);

    const order = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.storeId, store.id),
          sql`${schema.orders.deletedAt} IS NULL`
        )
      )
      .get();

    if (!order) return c.json({ success: false, error: 'Order not found' }, 404);

    if (order.status === 'shipped' || order.status === 'delivered') {
      return c.json({
        success: false,
        error: 'Cannot delete orders that are already shipped or delivered.',
      }, 400);
    }

    await db
      .update(schema.orders)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, id));

    return c.json({ success: true, data: { message: 'Order soft deleted successfully' } });
  })
);