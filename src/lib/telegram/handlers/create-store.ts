// src/lib/telegram/handlers/create-store.ts

import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import { stores, users } from '@/lib/db/schema'; 
import { eq, or } from 'drizzle-orm';
import { allocateCloudinaryAccount } from '@/lib/services/cloudinary'; 
import { classifyError } from '@/lib/errors/classifier';

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

/**
 * 🔗 توليد رابط الدخول المباشر للوحة التحكم
 */
async function generateLoginLink(userId: string, storeId: string, baseUrl: string): Promise<string> {
  return `${baseUrl}/ar/dashboard?user=${userId}&store=${storeId}`;
}

/**
 * 🎛️ تثبيت زر "لوحة التحكم" الثابت بأسفل شات تليجرام (Persistent WebApp Menu Button)
 */
async function attachTelegramMenuButton(
  telegramUserId: string | number,
  botToken: string,
  dashboardUrl: string
): Promise<void> {
  try {
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setChatMenuButton`;
    const response = await fetch(telegramApiUrl, {
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

    const resData = (await response.json()) as { ok?: boolean; description?: string };
    if (!resData.ok) {
      console.warn(`⚠️ [TelegramMenuButton] Non-fatal API response warning: ${resData.description}`);
    } else {
      console.log(`✅ [TelegramMenuButton] Persistent dashboard button linked for user: ${telegramUserId}`);
    }
  } catch (error) {
    console.error('❌ [TelegramMenuButton] Background execution error:', error);
  }
}

/**
 * 🏪 إنشاء متجر جديد متوافق تماماً مع قيود SQLite و Drizzle Schemas ودعم كامل للعربي
 */
export async function createStore(
  d1Database: D1Database, 
  data: CreateStoreInput,
  env?: Partial<CreateStoreEnv>
): Promise<CreateStoreOutput> {
  const db = drizzle(d1Database);
  let userId: string;

  const baseUrl = env?.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://www.dokany.workers.dev';

  // 1️⃣ البحث الذكي والآمن عن المستخدم الحالي
  const searchConditions = [];
  if (data.telegramUserId) {
    searchConditions.push(eq(users.telegramId, String(data.telegramUserId)));
    searchConditions.push(eq(users.id, String(data.telegramUserId)));
  }
  searchConditions.push(eq(users.phoneNumber, data.phone));

  const existingUser = await db
    .select()
    .from(users)
    .where(or(...searchConditions))
    .get();

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
      updatePayload.name = data.name;
    }

    if (Object.keys(updatePayload).length > 0) {
      try {
        await db
          .update(users)
          .set({ ...updatePayload, updatedAt: new Date() })
          .where(eq(users.id, existingUser.id));
        console.log(`✅ [createStore] Updated user record: ${existingUser.id}`);
      } catch (updateError) {
        console.error(`❌ [createStore] Failed updating user ${existingUser.id}:`, updateError);
      }
    }
  } else {
    try {
      const generatedId = crypto.randomUUID(); 
      
      const insertedUsers = await db
        .insert(users)
        .values({
          id: generatedId,
          name: data.name,
          phoneNumber: data.phone,
          authMethod: 'phone',
          status: 'active', 
          isVerified: true,
          emailVerified: false, 
          telegramId: data.telegramUserId ? String(data.telegramUserId) : null,
          merchantId: generatedId,
        })
        .returning();
      
      const newUser = insertedUsers[0];
      if (!newUser) throw new Error('BIZ_500: Failed to capture newly created user identity');
      userId = newUser.id;
      console.log(`✅ [createStore] Created brand new user: ${userId}`);
    } catch (insertError) {
      console.error('❌ [createStore] Failed creating new user:', insertError);
      throw classifyError(insertError);
    }
  }

  // 2️⃣ تنظيف وتجهيز الـ Slug واسم المتجر
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

  if (slugBase.startsWith('-')) {
    slugBase = 's' + slugBase;
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

  // 3️⃣ تخصيص حساب Cloudinary
  const allocatedAccountIndex = await allocateCloudinaryAccount(d1Database);

  // 4️⃣ Theme Defaults (كائن جافاسكريبت عادي وليس String)
  const defaultTheme = {
    colors: {
      primary: '#2563eb',
      secondary: '#7c3aed',
      background: '#ffffff',
      text: '#111827',
    },
    radii: {
      card: '0.75rem',
      button: '0.5rem',
      input: '0.5rem',
    },
    fontFamily: 'Cairo, sans-serif',
  };

  const now = new Date();

  // 5️⃣ إنشاء المتجر
  const storeToInsert: typeof stores.$inferInsert = {
    id: crypto.randomUUID(), 
    ownerId: userId,
    name: cleanStoreName,
    slug: slug,
    currency: 'EGP',
    country: 'EG',
    paymentGateway: 'cash', 
    templateVersion: 'v1',
    cloudinaryAccountIndex: allocatedAccountIndex, 
    theme: defaultTheme, // Drizzle يتكفل بعمل الـ Serialization لكونه mode: 'json'
    isActive: true,
    isVerified: false,
    isFeatured: false,
    createdAt: now,
    updatedAt: now,
  };

  const insertedStores = await db
    .insert(stores)
    .values(storeToInsert)
    .returning();

  const newStore = insertedStores[0];
  if (!newStore) {
    throw classifyError(
      new Error('BIZ_500: Failed to create and verify new store setup')
    );
  }

  console.log(`✅ [createStore] Store successfully deployed with slug: ${slug}`);

  // 6️⃣ إعداد الروابط واستدعاء Menu Button بشكل خلفي
  const dashboardLink = await generateLoginLink(userId, newStore.id, baseUrl);

  if (data.telegramUserId && env?.TELEGRAM_BOT_TOKEN) {
    attachTelegramMenuButton(data.telegramUserId, env.TELEGRAM_BOT_TOKEN, dashboardLink);
  }

  return {
    url: `${baseUrl}/${slug}`,
    dashboardLink,
    storeId: newStore.id,
    slug,
  };
}