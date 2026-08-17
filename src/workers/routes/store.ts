// src/workers/routes/store.ts

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import type { AppEnv } from '@/lib/env';
import { getDb } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { safeExecute, SystemError } from '@/lib/errors';
import { updateStoreSchema } from '@/lib/validations/store';
import { requireAuth } from '@/workers/middleware/auth';

export const storeRouter = new Hono<AppEnv>();

/**
 * 🟢 GET /api/store/:slug
 * جلب بيانات المتجر العامة مع إحصائياته
 */
storeRouter.get('/store/:slug', (c) =>
  safeExecute(async () => {
    const slug = c.req.param('slug');
    const db = getDb({ DB: c.env.DB });

    const rows = await db
      .select({
        store: schema.stores,
        stats: schema.storeStats,
      })
      .from(schema.stores)
      .leftJoin(
        schema.storeStats,
        eq(schema.stores.id, schema.storeStats.storeId)
      )
      .where(
        and(
          eq(schema.stores.slug, slug),
          eq(schema.stores.isActive, true),
          isNull(schema.stores.deletedAt)
        )
      )
      .get();

    if (!rows || !rows.store) {
      throw new SystemError({
        code: 'STORE_NOT_FOUND',
        userMessage: 'المتجر المطلوب غير موجود أو غير متاح حالياً.',
        technicalMessage: `Active and non-deleted store with slug '${slug}' was not found in D1.`,
        category: 'business',
        severity: 'info',
        retryable: false,
        shouldAlert: false,
        storeId: slug,
        metadata: {
          path: c.req.path,
          method: c.req.method,
          slug,
        },
      });
    }

    const { store, stats } = rows;

    return c.json(
      {
        success: true,
        data: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          shopName: store.shopName,
          description: store.description,
          logo: store.logo,
          coverImage: store.coverImage,
          phone: store.phone,
          email: store.email,
          country: store.country,
          currency: store.currency,
          settings: store.settings,
          theme: store.theme,
          isActive: store.isActive,
          createdAt: store.createdAt,
          stats: stats || {
            totalProducts: 0,
            totalOrders: 0,
            totalCustomers: 0,
            totalRevenue: 0,
          },
        },
      },
      200
    );
  })
);

/**
 * 🟡 PATCH /api/store/:id
 * تحديث بيانات المتجر وإعداداته (Settings & Theme)
 * 🛡️ محمية بـ Auth Middleware + Anti-IDOR
 */
storeRouter.patch('/store/:id', requireAuth, (c) =>
  safeExecute(async () => {
    const storeId = c.req.param('id');

    // ✅ 1. استخراج الـ userId والـ role بأمان
    const userId = c.get('userId');
    const user = c.get('user');
    const userRole = user?.role ?? 'merchant';

    const db = getDb({ DB: c.env.DB });

    // 2. جلب المتجر للتأكد من الملكية (Anti-IDOR) ومقارنة الإعدادات الحالية
    const existingStore = await db
      .select()
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.id, storeId),
          isNull(schema.stores.deletedAt)
        )
      )
      .get();

    if (!existingStore) {
      throw new SystemError({
        code: 'STORE_NOT_FOUND',
        userMessage: 'المتجر غير موجود.',
        technicalMessage: `Store '${storeId}' not found for update.`,
        category: 'business',
        severity: 'warning',
        retryable: false,
        shouldAlert: false,
        storeId,
        metadata: {
          userId,
          path: c.req.path,
          method: c.req.method,
        },
      });
    }

    // 3. التحقق من الملكية
    if (existingStore.ownerId !== userId) {
      throw new SystemError({
        code: 'FORBIDDEN',
        userMessage: 'ليس لديك صلاحية لتعديل هذا المتجر.',
        technicalMessage: `User '${userId}' attempted to modify store '${storeId}' owned by '${existingStore.ownerId}'.`,
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: true,
        storeId,
        metadata: {
          userId,
          path: c.req.path,
          method: c.req.method,
        },
      });
    }

    // 4. قراءة البيانات والتحقق منها بـ updateStoreSchema
    const body = await c.req.json();
    const validatedData = updateStoreSchema.parse(body);

    // 🔒 5. منع تصعيد الصلاحيات (Privilege Escalation Protection)
    const adminOnlyFields = ['isActive', 'isVerified', 'isFeatured'] as const;
    const requestedAdminFields = adminOnlyFields.filter(
      (field) => field in validatedData && validatedData[field] !== undefined
    );

    if (requestedAdminFields.length > 0 && userRole !== 'admin') {
      throw new SystemError({
        code: 'FORBIDDEN_ADMIN_ONLY',
        userMessage: 'هذه الإعدادات مخصصة للمسؤولين فقط. لا يمكنك تعديل حالة المتجر أو التحقق منه أو تمييزه.',
        technicalMessage: `User '${userId}' with role '${userRole}' attempted to modify admin-only fields: ${requestedAdminFields.join(', ')}`,
        category: 'security',
        severity: 'warning',
        retryable: false,
        shouldAlert: true,
        storeId,
        metadata: {
          requestedFields: requestedAdminFields,
          userId,
          path: c.req.path,
          method: c.req.method,
        },
      });
    }

    // 6. دمج الـ JSON لكل من settings و theme (Shallow Merge)
    const currentSettings = (existingStore.settings ?? {}) as Record<string, unknown>;
    const currentTheme = (existingStore.theme ?? {}) as Record<string, unknown>;

    const mergedSettings = validatedData.settings
      ? { ...currentSettings, ...validatedData.settings }
      : existingStore.settings;

    const mergedTheme = validatedData.theme
      ? { ...currentTheme, ...validatedData.theme }
      : existingStore.theme;

    // 7. تحديث قاعدة البيانات
    const updatedStore = await db
      .update(schema.stores)
      .set({
        ...validatedData,
        settings: mergedSettings as typeof schema.stores.$inferSelect.settings,
        theme: mergedTheme as typeof schema.stores.$inferSelect.theme,
        updatedAt: new Date(),
      })
      .where(eq(schema.stores.id, storeId))
      .returning()
      .get();

    return c.json({
      success: true,
      message: 'تم تحديث بيانات وإعدادات المتجر بنجاح.',
      data: updatedStore,
    });
  })
);