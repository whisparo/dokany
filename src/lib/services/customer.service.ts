// src/lib/services/customer.service.ts

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { customers, type Customer } from '@/lib/db/schema/customers';
import type { Env } from '@/lib/env';
import { SystemError } from '@/lib/errors/types'; // 👈 إضافة الـ SystemError

export interface FindOrCreateCustomerInput {
  storeId?: string;
  name: string;
  phone: string;
  email?: string;
}

export class CustomerService {
  /**
   * إيجاد العميل برقم الهاتف، أو إنشائه تلقائياً إذا لم يكن موجوداً
   */
  static async findOrCreateCustomer(
    env: Env,
    input: FindOrCreateCustomerInput
  ): Promise<Customer> {
    try {
      const db = getDb(env as unknown as Parameters<typeof getDb>[0]);

      // 1. البحث عن عميل موجود برقم الهاتف
      const [existingCustomer] = await db
        .select()
        .from(customers)
        .where(eq(customers.phone, input.phone))
        .limit(1);

      if (existingCustomer) {
        return existingCustomer;
      }

      // 2. إنشاء عميل جديد
      const newCustomerId = crypto.randomUUID();
      const cleanEmail = input.email && input.email.trim() !== '' ? input.email.trim() : null;
      const cleanName = input.name && input.name.trim() !== '' ? input.name.trim() : null;

      const [newCustomer] = await db
        .insert(customers)
        .values({
          id: newCustomerId,
          phone: input.phone,
          email: cleanEmail,
          name: cleanName,
          preferences: {
            language: 'ar',
            notifications: true,
          },
        })
        .returning();

      return newCustomer;
    } catch (error) {
      // 👈 تغليف أخطاء الداتابيز أو إنشاء العميل
      if (error instanceof SystemError) throw error;

      throw new SystemError({
        code: 'CUST_500',
        userMessage: 'حدث خطأ أثناء حفظ بيانات العميل، يرجى المحاولة مرة أخرى.',
        category: 'database',
        severity: 'warning',
        retryable: true,
        shouldAlert: true,
        technicalMessage: `CUSTOMER_CREATION_FAILURE: Failed to find or create customer with phone ${input.phone}.`,
        cause: error,
        metadata: { phone: input.phone, originalError: String(error) },
      });
    }
  }
}