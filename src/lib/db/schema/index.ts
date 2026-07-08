// src/lib/db/schema/index.ts

/**
 * نقطة التصدير المركزية لجميع جداول وأنواع قاعدة بيانات دكاني.
 *
 * هذا الملف هو الوحيد الذي يجب استيراده في باقي أجزاء التطبيق.
 * مثال: import { stores, products, type Store } from '@/lib/db/schema';
 */

// ============================================
// 🔐 BETTER AUTH & USERS
// ============================================
export { sessions, accounts } from './auth';
export type {
  Session,
  NewSession,
  Account,
  NewAccount,
  Verification,
  NewVerification,
} from './auth';

export { users } from './users';
export type { User, NewUser } from './users';

// ============================================
// 🏪 STORES
// ============================================
export { stores, storeStats } from './stores';  // ✅ أضف storeStats
export type { Store, NewStore, StoreStat, NewStoreStat } from './stores';

// ============================================
// 🛍️ CUSTOMERS
// ============================================
export { customers, customerStats, customerWallets } from './customers';  // ✅ أضف customerStats و customerWallets
export type {
  Customer,
  NewCustomer,
  CustomerStat,
  NewCustomerStat,
  CustomerWallet,
  NewCustomerWallet,
} from './customers';

// ============================================
// 📂 CATEGORIES
// ============================================
export { categories } from './categories';
export type { Category, NewCategory } from './categories';

// ============================================
// 📦 PRODUCTS
// ============================================
export { products } from './products';
export type { Product, NewProduct } from './products';
export { productStats } from './products';
export type { ProductStat, NewProductStat } from './products';

// ============================================
// 🖼️ MEDIA
// ============================================
export { media } from './media';
export type { Media, NewMedia } from './media';

// ============================================
// 📍 ADDRESSES
// ============================================
export { addresses } from './addresses';
export type { Address, NewAddress } from './addresses';

// ============================================
// 🛒 CART ITEMS
// ============================================
export { cartItems } from './cart-items';
export type { CartItem, NewCartItem } from './cart-items';

// ============================================
// 📋 ORDERS
// ============================================
export { orders } from './orders';
export type { Order, NewOrder, ShippingAddress } from './orders';

// ============================================
// 🧾 ORDER ITEMS
// ============================================
export { orderItems } from './order-items';
export type { OrderItem, NewOrderItem } from './order-items';

// ============================================
// 💳 PAYMENTS
// ============================================
export { payments } from './payments';
export type { Payment, NewPayment } from './payments';

// ============================================
// 🚚 SHIPMENTS
// ============================================
export { shipments } from './shipments';
export type { Shipment, NewShipment } from './shipments';

// ============================================
// 🎟️ COUPONS
// ============================================
export { coupons } from './coupons';
export type { Coupon, NewCoupon, CouponType } from './coupons';

// ============================================
// 💬 HAGGLE SESSIONS
// ============================================
export { haggleSessions } from './haggle-sessions';
export type {
  HaggleSession,
  NewHaggleSession,
  HaggleStatus,
  HaggleStrategy,
  CounterOffer,
} from './haggle-sessions';

// ============================================
// 👥 GROUP BUYS
// ============================================
export { groupBuys } from './group-buys';
export type { GroupBuy, NewGroupBuy, GroupBuyStatus } from './group-buys';

// ============================================
// 📱 TELEGRAM MESSAGES
// ============================================
export { telegramMessages } from './telegram-messages';
export type { TelegramMessage, NewTelegramMessage } from './telegram-messages';

// ============================================
// 📝 AUDIT LOGS
// ============================================
export { auditLogs } from './audit-logs';
export type { AuditLog, NewAuditLog, AuditAction } from './audit-logs';

// ============================================
// ⚙️ PLATFORM SETTINGS
// ============================================
export { platformSettings } from './platform-settings';
export type { PlatformSetting, NewPlatformSetting } from './platform-settings';

// ============================================
// 🌐 CUSTOM DOMAINS
// ============================================
export { customDomains } from './custom-domains';
export type { CustomDomain, NewCustomDomain } from './custom-domains';

// ============================================
// 💬 CHAT SESSIONS
// ============================================
export { chatSessions } from './chat-sessions';
export type { ChatSession, NewChatSession } from './chat-sessions';

// ============================================
// ⭐ REVIEWS
// ============================================
export { reviews } from './reviews';
export type { Review, NewReview } from './reviews';

// ============================================
// 🔁 IDEMPOTENCY
// ============================================
export { idempotency } from './idempotency';
export type { Idempotency, NewIdempotency } from './idempotency';
