// src/lib/services/customer.service.ts

import { eq, sql } from 'drizzle-orm';
import { Redis } from '@upstash/redis';
import { getDb } from '@/lib/db';
import { customers, type Customer } from '@/lib/db/schema/customers';
import { SystemError } from '@/lib/errors/types';

export interface FindOrCreateCustomerInput {
  storeId?: string;
  name: string;
  phone: string;
  email?: string;
}

const CUSTOMER_CACHE_TTL_SECONDS = 600; // 10 دقائق

export class CustomerService {
  /**
   * إيجاد العميل برقم الهاتف (مع الكاش)، أو إنشائه تلقائياً إذا لم يكن موجوداً
   */
  static async findOrCreateCustomer(
    env: CloudflareEnv,
    input: FindOrCreateCustomerInput
  ): Promise<Customer> {
    const cleanPhone = input.phone.trim();
    const cacheKey = `cache:customer:phone:${cleanPhone}`;

    // 1️⃣ تطبيق الكاش أولاً (Cache-Aside Pattern)
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      try {
        const redis = new Redis({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        });

        const cachedCustomer = await redis.get<Customer>(cacheKey);
        if (cachedCustomer) {
          return cachedCustomer;
        }
      } catch (cacheError) {
        console.warn('⚠️ Customer cache fetch failed, falling back to D1:', cacheError);
      }
    }

    try {
      const db = getDb(env);

      // 2️⃣ البحث عن العميل في قاعدة البيانات D1
      const [existingCustomer] = await db
        .select()
        .from(customers)
        .where(eq(customers.phone, cleanPhone))
        .limit(1);

      if (existingCustomer) {
        // حفظ النتيجة في Redis للأداء العالي في الطلبات القادمة
        await CustomerService.setCache(env, cacheKey, existingCustomer);
        return existingCustomer;
      }

      // 3️⃣ إنشاء عميل جديد إذا لم يوجد
      const newCustomerId = crypto.randomUUID();
      const cleanEmail = input.email && input.email.trim() !== '' ? input.email.trim() : null;
      const cleanName = input.name && input.name.trim() !== '' ? input.name.trim() : null;

      const [newCustomer] = await db
        .insert(customers)
        .values({
          id: newCustomerId,
          phone: cleanPhone,
          email: cleanEmail,
          name: cleanName,
          preferences: {
            language: 'ar',
            notifications: true,
          },
          createdAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .returning();

      if (!newCustomer) {
        throw new SystemError({
          code: 'CUST_501',
          userMessage: 'فشل حفظ بيانات العميل في قاعدة البيانات.',
          category: 'database',
          severity: 'critical',
          retryable: true,
          shouldAlert: true,
          technicalMessage: 'CUSTOMER_CREATION_FAILED: Database did not return created customer record.',
          metadata: { phone: cleanPhone },
        });
      }

      // حفظ العميل الجديد في الكاش
      await CustomerService.setCache(env, cacheKey, newCustomer);

      return newCustomer;
    } catch (error) {
      if (error instanceof SystemError) throw error;

      throw new SystemError({
        code: 'CUST_500',
        userMessage: 'حدث خطأ أثناء حفظ بيانات العميل، يرجى المحاولة مرة أخرى.',
        category: 'database',
        severity: 'warning',
        retryable: true,
        shouldAlert: true,
        technicalMessage: `CUSTOMER_CREATION_FAILURE: Failed to find or create customer with phone ${cleanPhone}.`,
        cause: error,
        metadata: { phone: cleanPhone, originalError: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /**
   * دالة مساعدة لتخزين العميل في Redis
   */
  private static async setCache(env: CloudflareEnv, key: string, customerData: Customer): Promise<void> {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return;

    try {
      const redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      });

      await redis.set(key, JSON.stringify(customerData), { ex: CUSTOMER_CACHE_TTL_SECONDS });
    } catch (error) {
      console.warn('⚠️ Failed to save customer to Redis cache:', error);
    }
  }
}