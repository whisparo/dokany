// src/lib/telegram/handlers/create-store.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { stores, users } from '@/lib/db/schema'; 
import { eq, or } from 'drizzle-orm';
import { allocateCloudinaryAccount } from '@/lib/services/cloudinary'; 
import { SystemError } from '@/lib/errors';

export interface CreateStoreEnv {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  NEXT_PUBLIC_APP_URL?: string;
}

export interface CreateStoreInput {
  phone: string;
  name: string;
  storeName: string; 
  telegramUserId?: string | number;
}

export interface CreateStoreOutput {
  url: string;
  dashboardLink: string;
  storeId: string;
  slug: string;
}

async function generateLoginLink(userId: string, storeId: string, baseUrl: string): Promise<string> {
  return `${baseUrl}/ar/dashboard?user=${userId}&store=${storeId}`;
}

async function attachTelegramMenuButton(
  telegramUserId: string | number,
  botToken: string,
  dashboardUrl: string
): Promise<void> {
  try {
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setChatMenuButton`;
    await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramUserId,
        menu_button: {
          type: 'web_app',
          text: '🎛️ لوحة التحكم',
          web_app: { url: dashboardUrl }
        }
      })
    });
  } catch (error) {
    console.error('❌ [TelegramMenuButton] Execution error:', error);
  }
}

export async function createStore(
  d1Database: D1Database, 
  data: CreateStoreInput,
  env?: Partial<CreateStoreEnv>
): Promise<CreateStoreOutput> {
  const db = drizzle(d1Database);
  let userId: string;

  const baseUrl = env?.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.dokany.workers.dev';

  // 1️⃣ البحث عن المستخدم أو إنشاؤه
  const searchConditions = [];
  if (data.telegramUserId) {
    searchConditions.push(eq(users.telegramId, String(data.telegramUserId)));
    searchConditions.push(eq(users.id, String(data.telegramUserId)));
  }
  if (data.phone) {
    searchConditions.push(eq(users.phoneNumber, data.phone));
  }

  const existingUser = searchConditions.length > 0 
    ? await db.select().from(users).where(or(...searchConditions)).get()
    : null;

  const now = new Date();

  if (existingUser) {
    userId = existingUser.id;

    const updatePayload: Record<string, any> = {};

    if (!existingUser.telegramId && data.telegramUserId) {
      updatePayload.telegramId = String(data.telegramUserId);
    }
    if (!existingUser.merchantId) {
      updatePayload.merchantId = existingUser.id;
    }
    if (!existingUser.name || existingUser.name.trim() === '') {
      updatePayload.name = data.name || 'تاجر جديد';
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await db
          .update(users)
          .set({ 
            ...updatePayload, 
            updatedAt: now
          })
          .where(eq(users.id, existingUser.id));
      } catch (updateError) {
        console.error(`❌ [createStore] Failed updating user ${existingUser.id}:`, updateError);
      }
    }
  } else {
    try {
      const generatedId = data.telegramUserId ? String(data.telegramUserId) : crypto.randomUUID(); 

      const insertedUsers = await db
        .insert(users)
        .values({
          id: generatedId,
          name: data.name || 'تاجر جديد',
          phoneNumber: data.phone,
          authMethod: 'telegram',
          status: 'active', 
          role: 'merchant',
          isVerified: true,
          emailVerified: false, 
          telegramId: data.telegramUserId ? String(data.telegramUserId) : null,
          merchantId: generatedId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const newUser = insertedUsers[0];
      if (!newUser) {
        throw new SystemError({
          code: 'DATABASE_ERROR',
          category: 'database',
          severity: 'critical',
          userMessage: 'فشل في إشعارات إنشاء هوية التاجر الجديد.',
          technicalMessage: 'Failed to capture newly created user identity from returning query.',
        });
      }
      userId = newUser.id;
    } catch (insertError) {
      if (insertError instanceof SystemError) throw insertError;

      console.error('❌ [createStore] Failed creating new user:', insertError);
      throw new SystemError({
        code: 'USER_CREATION_FAILED',
        category: 'database',
        severity: 'critical',
        userMessage: 'تعذر إنشاء حساب التاجر.',
        technicalMessage: insertError instanceof Error ? insertError.message : String(insertError),
      });
    }
  }

  // 2️⃣ تجهيز الـ Slug واسم المتجر
  let cleanStoreName = data.storeName.trim();
  const storePrefixRegex = /^(متجر|shop|store)\s+/i;
  if (storePrefixRegex.test(cleanStoreName)) {
    cleanStoreName = cleanStoreName.replace(storePrefixRegex, '');
  }

  let slugBase = cleanStoreName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9أ-ي-]/g, '');

  if (!slugBase || slugBase === '-' || slugBase.length < 2) {
    slugBase = `store-${crypto.randomUUID().slice(0, 5)}`;
  }

  const decodedSlug = decodeURIComponent(slugBase);

  const existingStore = await db
    .select()
    .from(stores)
    .where(eq(stores.slug, decodedSlug))
    .get();

  const slug = existingStore
    ? `${decodedSlug}-${crypto.randomUUID().slice(0, 4)}`
    : decodedSlug;

  // 3️⃣ تخصيص Cloudinary
  let allocatedAccountIndex = 0;
  try {
    allocatedAccountIndex = await allocateCloudinaryAccount(d1Database);
  } catch (cloudinaryErr) {
    console.error('⚠️ [createStore] Cloudinary allocation failed, fallback to default:', cloudinaryErr);
  }

  // 4️⃣ الإدراج في D1 Schema
  const storeId = crypto.randomUUID();

  try {
    await db.insert(stores).values({
      id: storeId,
      ownerId: userId,
      name: cleanStoreName,
      slug: slug,
      phone: data.phone || null,
      country: 'EG',
      currency: 'EGP',
      paymentGateway: 'cash',
      snapshotVersion: 1,
      settings: JSON.stringify({
        allowGuestCheckout: true,
        enableReviews: true,
        autoApproveOrders: true,
      }) as any,
      theme: JSON.stringify({
        primaryColor: '#2563eb',
        secondaryColor: '#7c3aed',
        fontFamily: 'Cairo, sans-serif',
      }) as any,
      templateVersion: 'v1',
      cloudinaryAccountIndex: allocatedAccountIndex,
      isActive: true,
      isVerified: false,
      isFeatured: false,
      createdAt: now,
      updatedAt: now,
    });
  } catch (storeInsertErr) {
    console.error('❌ [createStore] Store insertion failed:', storeInsertErr);
    throw new SystemError({
      code: 'STORE_CREATION_FAILED',
      category: 'database',
      severity: 'critical',
      userMessage: 'فشل في إنشاء سجل المتجر الجديد.',
      technicalMessage: storeInsertErr instanceof Error ? storeInsertErr.message : String(storeInsertErr),
    });
  }

  console.log(`✅ [createStore] Store successfully deployed with slug: ${slug}`);

  const dashboardLink = await generateLoginLink(userId, storeId, baseUrl);

  if (data.telegramUserId && env?.TELEGRAM_BOT_TOKEN) {
    attachTelegramMenuButton(data.telegramUserId, env.TELEGRAM_BOT_TOKEN, dashboardLink);
  }

  return {
    url: `${baseUrl}/${slug}`,
    dashboardLink,
    storeId,
    slug,
  };
}