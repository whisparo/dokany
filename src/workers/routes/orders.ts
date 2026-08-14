// src/worker/routes/orders.ts

import { Hono } from 'hono';
import { eq, and, desc, sql, isNull, count } from 'drizzle-orm';
import { z } from 'zod';
import type { Env } from '@/lib/env';
import { getDb } from '@/lib/db/db';
import * as schema from '@/lib/db/schema';
import { safeExecute } from '@/lib/errors/safe-executor';
import { SystemError } from '@/lib/errors/types';
import type { ShippingAddress, NewOrder } from '@/lib/db/schema/orders';
import type { ProductOptions, NewOrderItem } from '@/lib/db/schema/order-items';
import { requireAuth } from '@/workers/middleware/auth';

/* ============================================================================
 * 🛠️ TYPES & ENVS DECLARATIONS
 * ============================================================================ */

// ✅ نوع بيانات المستخدم للـ Context
export interface UserContext {
  id: string;
  email?: string;
  role?: string;
}

// ✅ تعريف بيئة Hono شاملة الـ Bindings والـ Variables
export interface AppEnv {
  Bindings: Env;
  Variables: {
    user?: UserContext;
  };
}

/* ============================================================================
 * 🛠️ VALIDATION SCHEMAS & TYPES
 * ============================================================================ */

const shippingAddressSchema = z.object({
  recipientName: z.string().min(1, 'اسم المستلم مطلوب'),
  recipientPhone: z.string().min(1, 'رقم هاتف المستلم مطلوب'),
  country: z.string().min(1, 'الدولة مطلوبة'),
  city: z.string().min(1, 'المدينة مطلوبة'),
  street: z.string().min(1, 'الشارع مطلوب'),
  buildingNumber: z.string().optional(),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  nearestLandmark: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
});

const createOrderItemSchema = z.object({
  productId: z.string().min(1, 'معرف المنتج مطلوب'),
  quantity: z.number().int().positive('الكمية يجب أن تكون أكبر من صفر'),
  price: z.number().int().nonnegative().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  variantSku: z.string().optional(),
});

const createOrderSchema = z.object({
  customerId: z.string().min(1, 'معرف العميل مطلوب'),
  customerName: z.string().min(1, 'اسم العميل مطلوب'),
  customerPhone: z.string().min(1, 'رقم هاتف العميل مطلوب'),
  customerEmail: z.string().email('البريد الإلكتروني غير صالح').optional().nullable(),
  addressId: z.string().optional().nullable(),
  shippingAddress: shippingAddressSchema,
  items: z.array(createOrderItemSchema).min(1, 'يجب تقديم عنصر واحد على الأقل'),
  shippingCost: z.union([z.number(), z.string()]).optional(),
  taxAmount: z.union([z.number(), z.string()]).optional(),
  discount: z.union([z.number(), z.string()]).optional(),
  couponCode: z.string().optional().nullable(),
  couponId: z.string().optional().nullable(),
  paymentMethod: z.enum(['cod', 'credit_card', 'wallet', 'bank_transfer', 'installments']).optional(),
  shippingMethod: z.enum(['standard', 'express', 'same-day', 'pickup']).optional(),
  customerNotes: z.string().optional().nullable(),
  haggleSessionId: z.string().optional().nullable(),
  haggleDiscount: z.union([z.number(), z.string()]).optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
  cancelReason: z.string().optional(),
});

interface PreparedOrderItem {
  productId: string;
  productName: string;
  productSlug: string | null;
  productSku: string;
  variantSku: string;
  productImage: string | null;
  productOptions: ProductOptions;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  netAmountCents: number;
}

/* ============================================================================
 * 🛠️ HELPER FUNCTIONS
 * ============================================================================ */

function toCents(amount: string | number | undefined | null): number {
  if (amount === undefined || amount === null || amount === '') return 0;
  const parsed = typeof amount === 'number' ? amount : parseFloat(amount);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function secureRandomInt(min: number, max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] % (max - min + 1));
}

/**
 * جلب المتجر والتأكد من وجوده + فحص الملكية عند اللزوم (Anti-IDOR)
 */
async function getStoreBySlugOrThrow(
  db: ReturnType<typeof getDb>,
  slug: string,
  path: string,
  requiredOwnerId?: string
) {
  const store = await db
    .select({ id: schema.stores.id, ownerId: schema.stores.ownerId })
    .from(schema.stores)
    .where(and(eq(schema.stores.slug, slug), isNull(schema.stores.deletedAt)))
    .get();

  if (!store) {
    throw new SystemError({
      code: 'STORE_NOT_FOUND',
      userMessage: 'المتجر المطلوب غير موجود.',
      technicalMessage: `Store with slug '${slug}' not found or deleted.`,
      category: 'business',
      severity: 'info',
      retryable: false,
      shouldAlert: false,
      context: { storeId: slug, path, extras: { storeSlug: slug } },
    });
  }

  // 🛡️ فحص الملكية للعمليات الخاصة بأصحاب المتاجر
  if (requiredOwnerId && store.ownerId !== requiredOwnerId) {
    throw new SystemError({
      code: 'FORBIDDEN',
      userMessage: 'ليس لديك صلاحية للتعامل مع طلبات هذا المتجر.',
      technicalMessage: `User '${requiredOwnerId}' attempted unauthorized operation on store '${store.id}' owned by '${store.ownerId}'.`,
      category: 'security',
      severity: 'warning',
      retryable: false,
      shouldAlert: true,
      context: { storeId: store.id, path },
    });
  }

  return store;
}

/* ============================================================================
 * 🌐 ROUTER IMPLEMENTATION
 * ============================================================================ */

// ✅ استخدام AppEnv لتحديد الـ Variables والـ Bindings بشكل استثنائي وصحيح
export const ordersRouter = new Hono<AppEnv>();

// ============================================================
// 🟢 GET Routes (عرض الطلبات)
// ============================================================

ordersRouter.get('/store/:slug/orders', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 20, 1), 100);
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
    const status = c.req.query('status');

    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

    const conditions = [
      eq(schema.orders.storeId, store.id),
      isNull(schema.orders.deletedAt),
    ];

    if (status) {
      conditions.push(eq(schema.orders.status, status));
    }

    const whereClause = and(...conditions);

    const countResult = await db
      .select({ count: count() })
      .from(schema.orders)
      .where(whereClause)
      .get();

    const total = countResult?.count ?? 0;

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
        pagination: { limit, offset, total, hasMore: offset + limit < total },
      },
    }, 200);
  })
);

ordersRouter.get('/store/:slug/orders/:id', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');

    const db = getDb({ DB: c.env.DB });
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

    const order = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.storeId, store.id),
          isNull(schema.orders.deletedAt)
        )
      )
      .get();

    if (!order) {
      throw new SystemError({
        code: 'ORDER_NOT_FOUND',
        userMessage: 'الطلب المطلوب غير موجود.',
        technicalMessage: `Order '${id}' not found in store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: store.id, path: c.req.path },
      });
    }

    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, id));

    return c.json({ success: true, data: { ...order, items } }, 200);
  })
);

// ============================================================
// 🟡 POST / PUT / DELETE Routes
// ============================================================

/**
 * POST /api/store/:slug/orders
 * ✅ متاح للزوار والعملاء للـ Checkout العام في المتجر
 */
ordersRouter.post('/store/:slug/orders', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const rawBody = await c.req.json();

    const parsed = createOrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new SystemError({
        code: 'ORDER_VALIDATION_ERROR',
        userMessage: parsed.error.issues[0]?.message || 'بيانات إنشاء الطلب غير صحيحة.',
        technicalMessage: JSON.stringify(parsed.error.issues),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: slug || 'unknown', path: c.req.path },
      });
    }

    const body = parsed.data;
    const db = getDb({ DB: c.env.DB });
    
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path);

    const result = await db.transaction(async (tx) => {
      let subtotalCents = 0;
      const preparedItems: PreparedOrderItem[] = [];

      for (const item of body.items) {
        const product = await tx
          .select()
          .from(schema.products)
          .where(
            and(
              eq(schema.products.id, item.productId),
              eq(schema.products.storeId, store.id),
              isNull(schema.products.deletedAt)
            )
          )
          .get();

        if (!product) {
          throw new SystemError({
            code: 'PRODUCT_NOT_FOUND',
            userMessage: `المنتج غير موجود أو محذوف.`,
            technicalMessage: `Product '${item.productId}' not found in store '${store.id}'.`,
            category: 'business',
            severity: 'info',
            retryable: false,
            shouldAlert: false,
            context: { storeId: store.id, path: c.req.path },
          });
        }

        if (product.stock < item.quantity) {
          throw new SystemError({
            code: 'INSUFFICIENT_STOCK',
            userMessage: `المنتج "${product.name}" لا يملك مخزوناً كافياً.`,
            technicalMessage: `Stock insufficient for product '${product.id}'. Requested: ${item.quantity}, Available: ${product.stock}.`,
            category: 'business',
            severity: 'info',
            retryable: false,
            shouldAlert: false,
            context: { storeId: store.id, path: c.req.path },
          });
        }

        const unitPriceCents = item.price !== undefined ? item.price : product.price;
        const lineTotalCents = unitPriceCents * item.quantity;

        subtotalCents += lineTotalCents;

        let mainImage: string | null = null;
        if (Array.isArray(product.images) && product.images.length > 0) {
          const firstImg = product.images[0];
          if (typeof firstImg === 'string') {
            mainImage = firstImg;
          } else if (typeof firstImg === 'object' && firstImg !== null && 'url' in firstImg) {
            mainImage = String((firstImg as { url?: unknown }).url ?? '');
          }
        }

        const sku = product.sku && product.sku.trim() !== '' ? product.sku : `SKU-${product.id.slice(0, 8)}`;
        const variantSku = item.variantSku && item.variantSku.trim() !== '' ? item.variantSku : sku;

        preparedItems.push({
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productSku: sku,
          variantSku,
          productImage: mainImage,
          productOptions: (item.options as ProductOptions) || {},
          quantity: item.quantity,
          priceCents: unitPriceCents,
          lineTotalCents,
          netAmountCents: lineTotalCents,
        });

        const updatedProducts = await tx
          .update(schema.products)
          .set({ stock: sql`${schema.products.stock} - ${item.quantity}` })
          .where(
            and(
              eq(schema.products.id, item.productId),
              sql`${schema.products.stock} >= ${item.quantity}`
            )
          )
          .returning({ updatedId: schema.products.id });

        if (updatedProducts.length === 0) {
          throw new SystemError({
            code: 'INSUFFICIENT_STOCK_RACE',
            userMessage: `حدث تغيير في المخزون للمنتج "${product.name}". يرجى إعادة المحاولة.`,
            technicalMessage: `Atomic stock reduction failed for product '${product.id}'.`,
            category: 'business',
            severity: 'info',
            retryable: true,
            shouldAlert: false,
            context: { storeId: store.id, path: c.req.path },
          });
        }
      }

      const shippingCostCents = toCents(body.shippingCost);
      const taxAmountCents = toCents(body.taxAmount);
      const generalDiscountCents = toCents(body.discount);
      const haggleDiscountCents = toCents(body.haggleDiscount);

      const totalDiscountCents = generalDiscountCents + haggleDiscountCents;
      const totalCents = subtotalCents + shippingCostCents + taxAmountCents - totalDiscountCents;

      if (totalCents < 0) {
        throw new SystemError({
          code: 'INVALID_ORDER_TOTAL',
          userMessage: 'إجمالي الطلب المحسوب لا يمكن أن يكون بالسالب.',
          technicalMessage: `Calculated total is negative: ${totalCents}`,
          category: 'validation',
          severity: 'info',
          retryable: false,
          shouldAlert: false,
          context: { storeId: store.id, path: c.req.path },
        });
      }

      const orderId = crypto.randomUUID();
      const randomPart = secureRandomInt(1000, 9999);
      const generatedOrderNumber = `ORD-${Date.now().toString().slice(-6)}-${randomPart}`;
      const now = new Date();

      const calculatedOriginalTotal = body.haggleSessionId
        ? subtotalCents + shippingCostCents + taxAmountCents
        : null;

      const newOrderPayload: NewOrder = {
        id: orderId,
        orderNumber: generatedOrderNumber,
        storeId: store.id,
        customerId: body.customerId,
        addressId: body.addressId ?? null,
        customerName: body.customerName.trim(),
        customerPhone: body.customerPhone.trim(),
        customerEmail: body.customerEmail ?? null,
        shippingAddress: body.shippingAddress as ShippingAddress,
        currency: 'EGP',
        subtotal: subtotalCents,
        shippingCost: shippingCostCents,
        taxAmount: taxAmountCents,
        discount: totalDiscountCents,
        total: totalCents,
        couponCode: body.couponCode ?? null,
        couponId: body.couponId ?? null,
        haggleSessionId: body.haggleSessionId ?? null,
        haggleDiscount: haggleDiscountCents,
        originalTotal: calculatedOriginalTotal,
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: body.paymentMethod ?? 'cod',
        shippingMethod: body.shippingMethod ?? 'standard',
        customerNotes: body.customerNotes ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const [newOrder] = await tx
        .insert(schema.orders)
        .values(newOrderPayload)
        .returning();

      const orderItemsData: NewOrderItem[] = preparedItems.map((item) => ({
        id: crypto.randomUUID(),
        orderId: newOrder.id,
        productId: item.productId,
        storeId: store.id,
        variantSku: item.variantSku,
        productName: item.productName,
        productSlug: item.productSlug,
        productImage: item.productImage ?? null,
        productSku: item.productSku,
        productOptions: item.productOptions,
        orderedQty: item.quantity,
        cancelledQty: 0,
        shippedQty: 0,
        returnedQty: 0,
        price: item.priceCents,
        lineTotal: item.lineTotalCents,
        originalPrice: item.priceCents,
        haggleDiscount: 0,
        discount: 0,
        taxAmount: 0,
        taxRate: 0,
        shippingCost: 0,
        commissionRate: 0,
        commissionAmount: 0,
        netAmount: item.netAmountCents,
        status: 'pending',
        fulfillmentStatus: 'unfulfilled',
        refundAmount: 0,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      }));

      await tx.insert(schema.orderItems).values(orderItemsData);

      return { order: newOrder, items: orderItemsData };
    });

    return c.json({ success: true, data: result }, 201);
  })
);

/**
 * PUT /api/store/:slug/orders/:id/status
 * ✅ محمي بـ requireAuth + TypeScript Type safe مع user?.id
 */
ordersRouter.put('/store/:slug/orders/:id/status', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const user = c.get('user'); // ✅ TypeScript ينص الآن بوضوح أنه UserContext | undefined
    const rawBody = await c.req.json();

    const parsed = updateOrderStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new SystemError({
        code: 'STATUS_VALIDATION_ERROR',
        userMessage: parsed.error.issues[0]?.message || 'حالة الطلب غير صحيحة.',
        technicalMessage: JSON.stringify(parsed.error.issues),
        category: 'validation',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: slug || 'unknown', path: c.req.path },
      });
    }

    const body = parsed.data;
    const db = getDb({ DB: c.env.DB });
    
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path, user?.id);

    await db.transaction(async (tx) => {
      const order = await tx
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.id, id),
            eq(schema.orders.storeId, store.id),
            isNull(schema.orders.deletedAt)
          )
        )
        .get();

      if (!order) {
        throw new SystemError({
          code: 'ORDER_NOT_FOUND',
          userMessage: 'الطلب غير موجود.',
          technicalMessage: `Order '${id}' not found for store '${store.id}'.`,
          category: 'business',
          severity: 'info',
          retryable: false,
          shouldAlert: false,
          context: { storeId: store.id, path: c.req.path },
        });
      }

      const nowTimestamp = new Date();
      const updateData: Partial<NewOrder> = {
        status: body.status,
        updatedAt: nowTimestamp,
      };

      if (body.status === 'confirmed') updateData.confirmedAt = nowTimestamp;
      if (body.status === 'shipped') updateData.shippedAt = nowTimestamp;
      if (body.status === 'delivered') updateData.deliveredAt = nowTimestamp;

      if (body.status === 'cancelled') {
        updateData.cancelledAt = nowTimestamp;
        updateData.cancelReason = body.cancelReason ?? 'تم الإلغاء بواسطة النظام/المسؤول';

        if (order.status !== 'cancelled') {
          const items = await tx
            .select()
            .from(schema.orderItems)
            .where(eq(schema.orderItems.orderId, id));

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
                  updatedAt: nowTimestamp,
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

    return c.json({ success: true, data: { message: `تم تحديث حالة الطلب إلى ${body.status}` } }, 200);
  })
);

/**
 * DELETE /api/store/:slug/orders/:id (Soft Delete)
 * ✅ محمي بـ requireAuth + TypeScript Type safe مع user?.id
 */
ordersRouter.delete('/store/:slug/orders/:id', requireAuth, (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const id = c.req.param('id');
    const user = c.get('user'); // ✅ تم التعرف عليه بدون مشاكل

    const db = getDb({ DB: c.env.DB });
    
    const store = await getStoreBySlugOrThrow(db, slug, c.req.path, user?.id);

    const order = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
          eq(schema.orders.storeId, store.id),
          isNull(schema.orders.deletedAt)
        )
      )
      .get();

    if (!order) {
      throw new SystemError({
        code: 'ORDER_NOT_FOUND',
        userMessage: 'الطلب غير موجود.',
        technicalMessage: `Order '${id}' not found for store '${store.id}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: store.id, path: c.req.path },
      });
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      throw new SystemError({
        code: 'ORDER_CANNOT_BE_DELETED',
        userMessage: 'لا يمكن حذف الطلبات التي تم شحنها أو توصيلها بالفعل.',
        technicalMessage: `Cannot delete order '${id}' with status '${order.status}'.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        context: { storeId: store.id, path: c.req.path },
      });
    }

    const now = new Date();
    await db
      .update(schema.orders)
      .set({
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.orders.id, id));

    return c.json({ success: true, data: { message: 'تم نقل الطلب إلى المحذوفات بنجاح' } }, 200);
  })
);