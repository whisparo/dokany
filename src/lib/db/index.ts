// src/lib/db/index.ts


// ============================================================
// 📂 استيراد جميع الجداول من مجلد schema
// ============================================================

import * as addresses from './schema/addresses';
import * as auditLogs from './schema/audit-logs';
import * as auth from './schema/auth';
import * as cartItems from './schema/cart-items';
import * as categories from './schema/categories';
import * as chatSessions from './schema/chat-sessions';
import * as coupons from './schema/coupons';
import * as customDomains from './schema/custom-domains';
import * as customers from './schema/customers';
import * as groupBuys from './schema/group-buys';
import * as haggleSessions from './schema/haggle-sessions';
import * as idempotency from './schema/idempotency';
import * as media from './schema/media';
import * as orderItems from './schema/order-items';
import * as orders from './schema/orders';
import * as payments from './schema/payments';
import * as platformSettings from './schema/platform-settings';
import * as products from './schema/products';
import * as reviews from './schema/reviews';
import * as shipments from './schema/shipments';
import * as stores from './schema/stores';
import * as telegramMessages from './schema/telegram-messages';
import * as users from './schema/users';

// ============================================================
// 🧠 دمج جميع الجداول في كائن Schema واحد
// ============================================================

const schema = {
  ...addresses,
  ...auditLogs,
  ...auth,
  ...cartItems,
  ...categories,
  ...chatSessions,
  ...coupons,
  ...customDomains,
  ...customers,
  ...groupBuys,
  ...haggleSessions,
  ...idempotency,
  ...media,
  ...orderItems,
  ...orders,
  ...payments,
  ...platformSettings,
  ...products,
  ...reviews,
  ...shipments,
  ...stores,
  ...telegramMessages,
  ...users,
};

// ============================================================
// 📦 إعادة تصدير getDb و DbInstance و D1Transaction
// ============================================================

export { getDb, type DbInstance, type D1Transaction } from './db';

// ============================================================
// 📤 تصدير الـ Schema الكامل لاستخدامه في Drizzle
// ============================================================

export { schema };