// src/dashboard/products-management/server/product.context.ts

import { headers } from 'next/headers';
import { SystemError } from '@/lib/errors';

export async function getStoreId(): Promise<string> {
  const headersList = await headers();
  const storeId = headersList.get('x-store-id');
  
  if (!storeId) {
    throw new SystemError({
      code: 'AUTH_NO_STORE',
      userMessage: 'لم يتم التعرف على المتجر، يرجى تسجيل الدخول مجدداً',
      technicalMessage: 'Missing store_id in request headers',
      category: 'business',
      severity: 'critical',
      retryable: false,
      shouldAlert: true,
    });
  }
  
  return storeId;
}