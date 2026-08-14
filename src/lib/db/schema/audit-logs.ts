// src/lib/db/schema/audit-logs.ts
import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// ============================================
// 📚 الـ Enums كـ Union Types ثابتة للسيستم
// ============================================
export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'LOGIN' 
  | 'LOGOUT'
  | 'PURCHASE'
  | 'REFUND'
  | 'HAGGLE_OFFER'
  | 'HAGGLE_ACCEPT';

// ============================================
// 🏛️ مصنع الجداول الديناميكية (Dynamic Table Factory)
// 📌 يضمن توليد جداول شهرية بصيغة: audit_logs_2026_07
// ============================================
export const getAuditLogsTable = (suffix: string) => {
  const tableName = `audit_logs_${suffix}`;

  return sqliteTable(
    tableName,
    {
      // ✅ توليد الـ UUID في التطبيق (وليس في D1) لسرعة الـ Edge
      id: text('id').primaryKey(),

      // ✅ بدون Foreign Keys متعمداً لضمان نجاح الـ DROP TABLE الشهري والـ Partitioning
      userId: text('user_id'),
      storeId: text('store_id'),

      // الفاعل
      userName: text('user_name'),
      userRole: text('user_role'),

      // الحدث
      action: text('action').$type<AuditAction>().notNull(),
      entityType: text('entity_type').notNull(),
      entityId: text('entity_id').notNull(),
      entityName: text('entity_name'),

      // ✅ Auto-parsing تلقائي للـ JSON في الـ Worker
      changes: text('changes', { mode: 'json' })
        .$type<{
          before?: Record<string, unknown>;
          after?: Record<string, unknown>;
          diff?: Record<string, { from: unknown; to: unknown }>;
        }>()
        .default({}),

      // السياق والشبكة
      ipAddress: text('ip_address'),
      userAgent: text('user_agent'),
      referrer: text('referrer'),
      requestId: text('request_id'),

      // حالة العملية
      success: integer('success', { mode: 'boolean' }).notNull().default(true),
      errorMessage: text('error_message'),

      metadata: text('metadata', { mode: 'json' })
        .$type<Record<string, unknown>>()
        .default({}),

      // ✅ توقيت متوافق 100% مع D1 SQLite و Epoch Milliseconds
      createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch() * 1000)`),
    },
    (table) => [
      // ============================================
      // ⚡ فهارس الأداء العالي
      // ============================================
      index(`${tableName}_user_idx`).on(table.userId),
      index(`${tableName}_store_idx`).on(table.storeId),
      index(`${tableName}_entity_idx`).on(table.entityType, table.entityId),
      index(`${tableName}_action_idx`).on(table.action),

      // الترتيب التنازلي لـ SQLite
      index(`${tableName}_created_idx`).on(sql`${table.createdAt} DESC`),

      // الفهرس المركب المثالي للـ Dashboard والاستعلام الحصري لكل تاجر
      index(`${tableName}_store_created_idx`).on(table.storeId, sql`${table.createdAt} DESC`),

      index(`${tableName}_request_id_idx`).on(table.requestId),

      // الفهرس الجزئي لمراقبة الأخطاء
      index(`${tableName}_success_idx`)
        .on(table.success)
        .where(sql`${table.success} = 0`),

      // ============================================
      // 🛡️ القيود المنطقية لحماية الـ Data Integrity
      // ============================================
      check(`${tableName}_chk_entity_type_not_empty`, sql`length(${table.entityType}) > 0`),
      check(`${tableName}_chk_entity_id_not_empty`, sql`length(${table.entityId}) > 0`),
      
      // تناسق حالة الخطأ
      check(
        `${tableName}_chk_error_message`, 
        sql`(${table.success} = 1 AND ${table.errorMessage} IS NULL) OR (${table.success} = 0 AND ${table.errorMessage} IS NOT NULL)`
      ),
      
      // ربط الحدث بمستخدم أو متجر
      check(`${tableName}_chk_user_or_store`, sql`${table.userId} IS NOT NULL OR ${table.storeId} IS NOT NULL`),
    ]
  );
};

export const auditLogs = getAuditLogsTable('default');

// ============================================
// 📚 استنتاج الأنواع الافتراضية
// ============================================
const defaultTable = getAuditLogsTable('default');
export type AuditLog = InferSelectModel<typeof defaultTable>;
export type NewAuditLog = InferInsertModel<typeof defaultTable>;