// src/lib/db/schema/relations.ts

import { relations } from 'drizzle-orm';

import { users } from './users';
import { customers } from './customers';
import { stores } from './stores';
import { categories } from './categories';
import { products } from './products';
import { addresses } from './addresses';
import { cartItems } from './cart-items';
import { orders } from './orders';
import { orderItems } from './order-items';
import { payments } from './payments';
import { shipments } from './shipments';
import { coupons } from './coupons';
import { haggleSessions } from './haggle-sessions';
import { groupBuys } from './group-buys';
import { telegramMessages } from './telegram-messages';
import { auditLogs } from './audit-logs';
import { customDomains } from './custom-domains';
import { chatSessions } from './chat-sessions';
import { reviews } from './reviews';
import { media } from './media';

// ============================================
// 🔐 BETTER AUTH – علاقات المصادقة
// ============================================
import { sessions, accounts } from './auth';

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

// ============================================
// 👥 USERS
// ============================================
export const usersRelations = relations(users, ({ many }) => ({
  stores: many(stores),
  auditLogs: many(auditLogs),
  chatSessions: many(chatSessions),
  sessions: many(sessions),
  accounts: many(accounts),
}));

// ============================================
// 🛍️ CUSTOMERS
// ============================================
export const customersRelations = relations(customers, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
  cartItems: many(cartItems),
  haggleSessions: many(haggleSessions),
  telegramMessages: many(telegramMessages),
  groupBuysLed: many(groupBuys),
}));

// ============================================
// 🏪 STORES
// ============================================
export const storesRelations = relations(stores, ({ one, many }) => ({
  owner: one(users, {
    fields: [stores.ownerId],
    references: [users.id],
  }),
  products: many(products),
  categories: many(categories),
  orders: many(orders),
  shipments: many(shipments),
  payments: many(payments),
  coupons: many(coupons),
  haggleSessions: many(haggleSessions),
  groupBuys: many(groupBuys),
  telegramMessages: many(telegramMessages),
  auditLogs: many(auditLogs),
  customDomains: many(customDomains),
  chatSessions: many(chatSessions),
}));

// ============================================
// 📂 CATEGORIES
// ============================================
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  store: one(stores, {
    fields: [categories.storeId],
    references: [stores.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categoryHierarchy',
  }),
  children: many(categories, { relationName: 'categoryHierarchy' }),
  products: many(products),
}));

// ============================================
// 📦 PRODUCTS
// ============================================
export const productsRelations = relations(products, ({ one, many }) => ({
  store: one(stores, {
    fields: [products.storeId],
    references: [stores.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  orderItems: many(orderItems),
  cartItems: many(cartItems),
  haggleSessions: many(haggleSessions),
  groupBuys: many(groupBuys),
  reviews: many(reviews),
}));

// ============================================
// 📍 ADDRESSES
// ============================================
export const addressesRelations = relations(addresses, ({ one, many }) => ({
  customer: one(customers, {
    fields: [addresses.customerId],
    references: [customers.id],
  }),
  orders: many(orders),
}));

// ============================================
// 🛒 CART ITEMS
// ============================================
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  customer: one(customers, {
    fields: [cartItems.customerId],
    references: [customers.id],
  }),
  store: one(stores, {
    fields: [cartItems.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));

// ============================================
// 📋 ORDERS
// ============================================
export const ordersRelations = relations(orders, ({ one, many }) => ({
  store: one(stores, {
    fields: [orders.storeId],
    references: [stores.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  address: one(addresses, {
    fields: [orders.addressId],
    references: [addresses.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  shipments: many(shipments),
  haggleSession: one(haggleSessions, {
    fields: [orders.haggleSessionId],
    references: [haggleSessions.id],
  }),
  groupBuy: one(groupBuys, {
    fields: [orders.groupBuyId],
    references: [groupBuys.id],
  }),
}));

// ============================================
// 🧾 ORDER ITEMS
// ============================================
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

// ============================================
// 💳 PAYMENTS
// ============================================
export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  store: one(stores, {
    fields: [payments.storeId],
    references: [stores.id],
  }),
}));

// ============================================
// 🚚 SHIPMENTS
// ============================================
export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, {
    fields: [shipments.orderId],
    references: [orders.id],
  }),
  store: one(stores, {
    fields: [shipments.storeId],
    references: [stores.id],
  }),
}));

// ============================================
// 🎟️ COUPONS
// ============================================
export const couponsRelations = relations(coupons, ({ one }) => ({
  store: one(stores, {
    fields: [coupons.storeId],
    references: [stores.id],
  }),
}));

// ============================================
// 💬 HAGGLE SESSIONS
// ============================================
export const haggleSessionsRelations = relations(haggleSessions, ({ one }) => ({
  store: one(stores, {
    fields: [haggleSessions.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [haggleSessions.productId],
    references: [products.id],
  }),
  customer: one(customers, {
    fields: [haggleSessions.customerId],
    references: [customers.id],
  }),
  order: one(orders, {
    fields: [haggleSessions.orderId],
    references: [orders.id],
  }),
}));

// ============================================
// 👥 GROUP BUYS
// ============================================
export const groupBuysRelations = relations(groupBuys, ({ one, many }) => ({
  store: one(stores, {
    fields: [groupBuys.storeId],
    references: [stores.id],
  }),
  product: one(products, {
    fields: [groupBuys.productId],
    references: [products.id],
  }),
  leader: one(customers, {
    fields: [groupBuys.leaderId],
    references: [customers.id],
  }),
  orders: many(orders),
}));

// ============================================
// 📱 TELEGRAM MESSAGES
// ============================================
export const telegramMessagesRelations = relations(telegramMessages, ({ one }) => ({
  store: one(stores, {
    fields: [telegramMessages.storeId],
    references: [stores.id],
  }),
  customer: one(customers, {
    fields: [telegramMessages.customerId],
    references: [customers.id],
  }),
}));

// ============================================
// 📝 AUDIT LOGS
// ============================================
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [auditLogs.storeId],
    references: [stores.id],
  }),
}));

// ============================================
// 🌐 CUSTOM DOMAINS
// ============================================
export const customDomainsRelations = relations(customDomains, ({ one }) => ({
  store: one(stores, {
    fields: [customDomains.storeId],
    references: [stores.id],
  }),
}));

// ============================================
// 💬 CHAT SESSIONS
// ============================================
export const chatSessionsRelations = relations(chatSessions, ({ one }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [chatSessions.storeId],
    references: [stores.id],
  }),
}));

// ============================================
// ⭐ REVIEWS
// ============================================
export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
}));

// ============================================
// 🖼️ MEDIA
// ============================================
export const mediaRelations = relations(media, ({ one }) => ({
  store: one(stores, {
    fields: [media.storeId],
    references: [stores.id],
  }),
}));