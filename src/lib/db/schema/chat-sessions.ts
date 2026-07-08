// src/lib/db/schema/chat-sessions.ts

import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

import { users } from './users';
import { stores } from './stores';

// ============================================
// 📦 أنواع TypeScript (في أول الملف)
// ============================================

export type ChatSessionStep = 
  | 'phone' 
  | 'name' 
  | 'store' 
  | 'niche' 
  | 'completed'
  | 'expired';

export type ChatPlatform = 'telegram' | 'web' | 'whatsapp' | 'messenger';

export type ChatSessionState = {
  step?: ChatSessionStep;
  phone?: string;
  name?: string;
  storeName?: string;
  niche?: string;
  lastProductCode?: string;
  failedAttempts?: number;
  metadata?: Record<string, unknown>;
};

export type ChatSessionTimestamps = {
  firstMessageAt?: number;
  lastMessageAt?: number;
  completedAt?: number;
  [key: string]: number | undefined;
};

// ============================================
// 💬 جدول جلسات الشات (Chat Sessions) - D1 Compatible
// ============================================

export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(), // UUID يُولَّد في كود التطبيق

    // 🔗 العلاقات (Cascade/Set Null مضبوطة هندسياً)
    userId: text('user_id'),
    storeId: text('store_id'),

    // 🌐 بيانات الجلسة الأساسية
    platform: text('platform').notNull(),
    externalId: text('external_id').notNull(),
    visitorFingerprint: text('visitor_fingerprint'),

    // 📦 الحالة (JSON الصريح والـ Default بـ SQL string لسلامة الـ D1 Driver)
    state: text('state', { mode: 'json' })
      .$type<ChatSessionState>()
      .notNull()
      .default(sql`'{}'`),

    // 📊 الطوابع الزمنية 
    timestamps: text('timestamps', { mode: 'json' })
      .$type<ChatSessionTimestamps>()
      .notNull()
      .default(sql`'{}'`),

    // ⏱️ آخر نشاط بنظام الـ Unix Timestamp (الملي ثانية) لأداء فلكي في الـ Ordering
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),

    deletedAt: integer('deleted_at', { mode: 'timestamp' }),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    // ============================================
    // 🔗 Foreign Keys الصارمة لمنع الـ Deprecated Warnings
    // ============================================
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'chat_sessions_user_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    foreignKey({
      columns: [table.storeId],
      foreignColumns: [stores.id],
      name: 'chat_sessions_store_id_fkey',
    }).onDelete('set null').onUpdate('cascade'),

    // ============================================
    // 🗝️ الفهارس الاستراتيجية والأداء العالي
    // ============================================
    uniqueIndex('chat_sessions_platform_external_unique')
      .on(table.platform, table.externalId),

    index('chat_sessions_last_activity_idx').on(table.lastActivityAt),
    index('chat_sessions_created_idx').on(table.createdAt),
    
    index('chat_sessions_deleted_idx')
      .on(table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),

    index('chat_sessions_user_idx')
      .on(table.userId)
      .where(sql`${table.userId} IS NOT NULL`),

    index('chat_sessions_store_idx')
      .on(table.storeId)
      .where(sql`${table.storeId} IS NOT NULL`),

    index('chat_sessions_platform_idx').on(table.platform),

    index('chat_sessions_visitor_idx')
      .on(table.visitorFingerprint)
      .where(sql`${table.visitorFingerprint} IS NOT NULL`),

    // فهارس مركبة سريعة جداً لخدمة الـ Dashboard والـ Bot Routing
    index('chat_sessions_store_platform_idx')
      .on(table.storeId, table.platform)
      .where(sql`${table.deletedAt} IS NULL`),

    index('chat_sessions_user_platform_idx')
      .on(table.userId, table.platform)
      .where(sql`${table.userId} IS NOT NULL AND ${table.deletedAt} IS NULL`),

    // ============================================
    // 🛡️ القيود المنطقية الصارمة (Check Constraints)
    // ============================================
    check('chk_platform', sql`${table.platform} IN ('telegram', 'web', 'whatsapp', 'messenger')`),
    check('chk_platform_length', sql`length(${table.platform}) BETWEEN 1 AND 50`),
    
    check('chk_external_id_not_empty', sql`length(${table.externalId}) > 0`),
    check('chk_external_id_length', sql`length(${table.externalId}) <= 255`),
    
    // 🚀 تصليح سنيور: جلسات الويب لازم الـ storeId موجود، وجلسات البوتات مربوطة بالـ externalId لتأمين الـ Lead Generation
    check(
      'chk_session_routing_integrity',
      sql`(${table.platform} = 'web' AND ${table.storeId} IS NOT NULL) OR (${table.platform} IN ('telegram', 'whatsapp', 'messenger') AND length(${table.externalId}) > 0)`
    ),

    // فحص الـ Step المأخوذة من الـ JSON
    check(
      'chk_state_step',
      sql`
        json_extract(${table.state}, '$.step') IS NULL 
        OR json_extract(${table.state}, '$.step') IN ('phone','name','store','niche','completed','expired')
      `
    ),

    // التحقق من سلامة الـ JSON Object
    check(
      'chk_timestamps_object',
      sql`json_valid(${table.timestamps}) = 1 AND json_type(${table.timestamps}) = 'object'`
    ),

    // 🚀 تصليح سنيور: توسيع الـ GLOB ليدعم الحروف الكابيتال والسمول ومنع الـ Constraint Collapse
    check(
      'chk_visitor_fingerprint',
      sql`
        ${table.visitorFingerprint} IS NULL 
        OR (
          length(${table.visitorFingerprint}) = 64 
          AND ${table.visitorFingerprint} GLOB '[a-fA-F0-9]*'
          AND ${table.visitorFingerprint} NOT GLOB '*[^a-fA-F0-9]*'
        )
      `
    ),
  ]
);

// ============================================
// 📚 أنواع الـ Inference للـ Drizzle
// ============================================
export type ChatSession = InferSelectModel<typeof chatSessions>;
export type NewChatSession = InferInsertModel<typeof chatSessions>;

// ============================================
// 🛠️ دوال الـ Validation المساعدة (Type-Safe)
// ============================================

export function validateVisitorFingerprint(fingerprint: string): boolean {
  if (!fingerprint) return false;
  if (fingerprint.length !== 64) return false;
  return /^[a-f0-9]+$/i.test(fingerprint);
}

export function validatePlatform(platform: string): platform is ChatPlatform {
  return ['telegram', 'web', 'whatsapp', 'messenger'].includes(platform);
}

export function isSessionExpired(session: ChatSession): boolean {
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return now - session.lastActivityAt.getTime() > thirtyDaysMs;
}

export function getSessionStep(session: ChatSession): ChatSessionStep | undefined {
  return session.state?.step;
}

export function updateSessionStep(
  session: ChatSession,
  step: ChatSessionStep
): ChatSessionState {
  return {
    ...session.state,
    step,
  };
}