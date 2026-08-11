// src/lib/db/index.ts

// ============================================================
// 📂 استيراد جميع الجداول والأنواع من مجلد schema
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
// 🧠 دمج جميع الجداول في كائن Schema واحد لـ Drizzle Client
// ============================================================

export const schema = {
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
// 📤 إعادة تصدير كافة الجداول والأنواع مباشرة
// ============================================================

export * from './schema/addresses';
export * from './schema/audit-logs';
export * from './schema/auth';
export * from './schema/cart-items';
export * from './schema/categories';
export * from './schema/chat-sessions';
export * from './schema/coupons';
export * from './schema/custom-domains';
export * from './schema/customers';
export * from './schema/group-buys';
export * from './schema/haggle-sessions';
export * from './schema/idempotency';
export * from './schema/media';
export * from './schema/order-items';
export * from './schema/orders';
export * from './schema/payments';
export * from './schema/platform-settings';
export * from './schema/products';
export * from './schema/reviews';
export * from './schema/shipments';
export * from './schema/stores';
export * from './schema/telegram-messages';
export * from './schema/users';

// ============================================================
// 📦 إعادة تصدير getDb و DbInstance و D1Transaction
// ============================================================

export { getDb, type DbInstance, type D1Transaction } from './db';