// src/lib/db/index.ts

import { getDb, type D1Transaction, type DbInstance } from './db';
// استورد كل السكيمات اللي عندك
import * as users from './schema/users';
import * as customers from './schema/customers';
import * as stores from './schema/stores';
import * as orders from './schema/orders';
import * as products from './schema/products';

// تجميع كل الجداول في كائن واحد (Schema Object)
const schema = {
  ...users,
  ...customers,
  ...stores,
  ...orders,
  ...products
};

// تصدير الأدوات والسكيمة المجمعة
export { getDb, type D1Transaction, type DbInstance };
export { schema };