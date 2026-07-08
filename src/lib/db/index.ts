// src/lib/db/index.ts

import { getDb, type D1Transaction, type DbInstance } from './db';
import * as users from './schema/users';
import * as customers from './schema/customers';
import * as stores from './schema/stores';
import * as orders from './schema/orders';
import * as products from './schema/products';
import * as chatSessions from './schema/chat-sessions'; // ✅ أضفنا ده

const schema = {
  ...users,
  ...customers,
  ...stores,
  ...orders,
  ...products,
  ...chatSessions // ✅ أضفنا ده
};

export { getDb, type D1Transaction, type DbInstance };
export { schema };