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

      // ✅ فك الارتباط (بدون Foreign Keys) لضمان نجاح الـ DROP TABLE الشهري والـ Isolation
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

      // ✅ الإصلاح: إرجاع { mode: 'json' } لضمان الـ Auto-parsing التلقائي في الـ Worker
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

      // ✅ الإصلاح: إرجاع { mode: 'json' } هنا أيضاً
      metadata: text('metadata', { mode: 'json' })
        .$type<Record<string, unknown>>()
        .default({}),

      // ✅ توقيت دقيق بالـ Milliseconds متوافق تماماً مع الـ Epoch timestamps والـ Redis
      createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(strftime('%s', 'now') * 1000)`),
    },
    (table) => [
      // ============================================
      // ⚡ فهارس الأداء العالي
      // ============================================
      index(`${tableName}_user_idx`).on(table.userId),
      index(`${tableName}_store_idx`).on(table.storeId),
      index(`${tableName}_entity_idx`).on(table.entityType, table.entityId),
      index(`${tableName}_action_idx`).on(table.action),

      // ✅ الترتيب التنازلي لـ SQLite المقفل بدون خطوط حمراء
      index(`${tableName}_created_idx`).on(sql`${table.createdAt} DESC`),

      // ✅ الفهرس المركب المثالي للـ Dashboard والاستعلام الحصري لكل تاجر
      index(`${tableName}_store_created_idx`).on(table.storeId, sql`${table.createdAt} DESC`),

      index(`${tableName}_request_id_idx`).on(table.requestId),

      // ✅ الفهرس الجزئي الذكي لمراقبة الأخطاء وحصر الـ Exceptions
      index(`${tableName}_success_idx`)
        .on(table.success)
        .where(sql`${table.success} = 0`),

      // ============================================
      // 🛡️ القيود المنطقية لحماية الـ Data Integrity
      // ============================================
      check(`${tableName}_chk_entity_type_not_empty`, sql`length(${table.entityType}) > 0`),
      check(`${tableName}_chk_entity_id_not_empty`, sql`length(${table.entityId}) > 0`),
      
      // تناسق حالة الخطأ: يمنع تضارب الـ Status مع وجود رسالة خطأ
      check(
        `${tableName}_chk_error_message`, 
        sql`(${table.success} = 1 AND ${table.errorMessage} IS NULL) OR (${table.success} = 0 AND ${table.errorMessage} IS NOT NULL)`
      ),
      
      // يجب أن يكون الحدث مرتبطاً بمطلب واحد على الأقل (مستخدم أو متجر)
      check(`${tableName}_chk_user_or_store`, sql`${table.userId} IS NOT NULL OR ${table.storeId} IS NOT NULL`),
    ]
  );
};
export const auditLogs = getAuditLogsTable('default');

// ============================================
// 📚 استنتاج الأنواع الافتراضية للمساعدة في الـ Codebase
// ============================================
const defaultTable = getAuditLogsTable('default');
export type AuditLog = InferSelectModel<typeof defaultTable>;
export type NewAuditLog = InferInsertModel<typeof defaultTable>;

