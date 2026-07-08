// src/lib/db/index.ts

import * as users from './schema/users';
import * as customers from './schema/customers';
import * as stores from './schema/stores';
import * as orders from './schema/orders';
import * as products from './schema/products';
import * as chatSessions from './schema/chat-sessions';

const schema = {
  ...users,
  ...customers,
  ...stores,
  ...orders,
  ...products,
  ...chatSessions,
};

// ✅ إعادة تصدير getDb و DbInstance من db.ts
export { getDb, type DbInstance, type D1Transaction } from './db';
export { schema };