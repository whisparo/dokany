// src/lib/db/schema/auth.ts

import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// 1. جدول الجلسات (Session) - متوافق مع معايير Better Auth الفطرية
// ============================================================================
export const sessions = sqliteTable(
  'session', // ✅ تم تحويل الاسم للمفرد ليطابق Better Auth تلقائياً دون كراش
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    tokenFamily: text('token_family').notNull(), // Custom Field للـ Rotation حارس بوابة إضافي
  },
  (table) => [
    uniqueIndex('session_token_unique').on(table.token),
    index('session_expires_at_idx').on(table.expiresAt),
    index('session_token_family_idx').on(table.tokenFamily),
    index('session_user_expires_idx').on(table.userId, table.expiresAt),
    index('session_user_token_family_idx').on(table.userId, table.tokenFamily),
    check('chk_session_token_not_empty', sql`length(${table.token}) > 0`),
  ]
);

// ============================================================================
// 2. جدول الحسابات الخارجية (Account) - متوافق مع Better Auth
// ============================================================================
export const accounts = sqliteTable(
  'account', // ✅ تم تحويل الاسم للمفرد
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    index('account_user_provider_idx').on(table.userId, table.providerId),
    index('account_provider_idx').on(table.providerId),
    uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId),
    check('chk_account_id_not_empty', sql`length(${table.accountId}) > 0`),
    check('chk_provider_id_not_empty', sql`length(${table.providerId}) > 0`),
  ]
);

// ============================================================================
// 3. جدول التحقق (Verification) - متوافق مع Better Auth
// ============================================================================
export const verifications = sqliteTable(
  'verification', // ✅ تم تحويل الاسم للمفرد
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [
    index('verification_identifier_idx').on(table.identifier),
    index('verification_expires_at_idx').on(table.expiresAt),
    uniqueIndex('verification_identifier_value_unique').on(table.identifier, table.value),
    check('chk_verification_identifier_not_empty', sql`length(${table.identifier}) > 0`),
    check('chk_verification_value_not_empty', sql`length(${table.value}) > 0`),
  ]
);

// Types
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;
export type Account = InferSelectModel<typeof accounts>;
export type NewAccount = InferInsertModel<typeof accounts>;
export type Verification = InferSelectModel<typeof verifications>;
export type NewVerification = InferInsertModel<typeof verifications>;