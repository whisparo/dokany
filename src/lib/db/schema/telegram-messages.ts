// src/lib/db/schema/telegram-messages.ts

import { sqliteTable, text, integer, index, uniqueIndex, check, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql, eq, and, isNull, desc, count, between } from 'drizzle-orm';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { classifyError } from '@/lib/errors/classifier';

import { stores } from './stores';
import { customers } from './customers';
import { users } from './users';
import { orders } from './orders';
import { chatSessions } from './chat-sessions';

// ============================================
// 📦 أنواع TypeScript والـ Bindings
// ============================================

export type MessageDirection = 'incoming' | 'outgoing';
export type MessageType = 'text' | 'photo' | 'sticker' | 'contact' | 'callback_query' | 'command' | 'video' | 'document' | 'audio' | 'voice' | 'location' | 'other';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
export type MessageLanguage = 'ar' | 'en' | 'fr' | 'es';

export type TelegramButton = { text: string; callback_data?: string; url?: string; switch_inline_query?: string; pay?: boolean; };
export type InlineKeyboard = { inline_keyboard: TelegramButton[][]; };
export type ReplyKeyboard = { keyboard?: Array<Array<{ text: string; request_contact?: boolean; request_location?: boolean; }>>; resize_keyboard?: boolean; one_time_keyboard?: boolean; selective?: boolean; };
export type Attachment = { type: 'photo' | 'video' | 'document' | 'audio' | 'voice'; fileId: string; fileUniqueId?: string; fileName?: string; fileSize?: number; mimeType?: string; width?: number; height?: number; duration?: number; };
export type MessageEntity = { type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'pre' | 'text_link' | 'text_mention' | 'mention' | 'hashtag' | 'cashtag' | 'bot_command' | 'url' | 'email' | 'phone_number'; offset: number; length: number; url?: string; user?: { id: number; first_name: string; }; language?: string; };
export type TelegramMessageMetadata = { user_name?: string; user_username?: string; user_language_code?: string; chat_type?: 'private' | 'group' | 'supergroup' | 'channel'; chat_title?: string; edit_date?: number; forward_from?: number; forward_from_chat?: number; [key: string]: unknown; };

// ============================================
// 📱 جدول رسائل تليجرام (Telegram Messages)
// ============================================

export const telegramMessages = sqliteTable(
  'telegram_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    storeId: text('store_id'),
    customerId: text('customer_id'),
    userId: text('user_id'),
    orderId: text('order_id'),
    chatSessionId: text('chat_session_id'),
    chatId: text('chat_id').notNull(),
    telegramUserId: text('telegram_user_id'),
    telegramMessageId: integer('telegram_message_id'),
    replyToMessageId: integer('reply_to_message_id'),
    updateId: integer('update_id'),
    webhookId: text('webhook_id'),
    direction: text('direction').$type<MessageDirection>().notNull(),
    messageType: text('message_type').$type<MessageType>().notNull(),
    status: text('status').$type<MessageStatus>().notNull().default('pending'),
    content: text('content'),
    caption: text('caption'),
    command: text('command'),
    language: text('language').$type<MessageLanguage>().notNull().default('ar'),
    attachments: text('attachments', { mode: 'json' }).$type<Attachment[]>().notNull().default(sql`'[]'`),
    fileId: text('file_id'),
    fileUniqueId: text('file_unique_id'),
    buttons: text('buttons', { mode: 'json' }).$type<TelegramButton[][]>().notNull().default(sql`'[]'`),
    inlineKeyboard: text('inline_keyboard', { mode: 'json' }).$type<InlineKeyboard>(),
    replyKeyboard: text('reply_keyboard', { mode: 'json' }).$type<ReplyKeyboard>(),
    entities: text('entities', { mode: 'json' }).$type<MessageEntity[]>().notNull().default(sql`'[]'`),
    metadata: text('metadata', { mode: 'json' }).$type<TelegramMessageMetadata>().notNull().default(sql`'{}'`),
    processedAt: integer('processed_at', { mode: 'timestamp' }),
    processingError: text('processing_error'),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
    readAt: integer('read_at', { mode: 'timestamp' }),
    retryCount: integer('retry_count').notNull().default(0),
    lastRetryAt: integer('last_retry_at', { mode: 'timestamp' }),
    failureReason: text('failure_reason'),
    failureCode: text('failure_code'),
    spamScore: integer('spam_score').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => [
    foreignKey({ columns: [table.storeId], foreignColumns: [stores.id], name: 'telegram_messages_store_id_fkey' }).onDelete('cascade'),
    foreignKey({ columns: [table.customerId], foreignColumns: [customers.id], name: 'telegram_messages_customer_id_fkey' }).onDelete('set null'),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: 'telegram_messages_user_id_fkey' }).onDelete('set null'),
    foreignKey({ columns: [table.orderId], foreignColumns: [orders.id], name: 'telegram_messages_order_id_fkey' }).onDelete('set null'),
    foreignKey({ columns: [table.chatSessionId], foreignColumns: [chatSessions.id], name: 'telegram_messages_chat_session_id_fkey' }).onDelete('set null'),

    uniqueIndex('telegram_messages_telegram_id_unique').on(table.telegramMessageId).where(sql`${table.telegramMessageId} IS NOT NULL`),
    uniqueIndex('telegram_messages_update_id_unique').on(table.updateId).where(sql`${table.updateId} IS NOT NULL`),

    index('telegram_messages_store_idx').on(table.storeId).where(sql`${table.storeId} IS NOT NULL`),
    index('telegram_messages_customer_idx').on(table.customerId).where(sql`${table.customerId} IS NOT NULL`),
    index('telegram_messages_user_idx').on(table.userId).where(sql`${table.userId} IS NOT NULL`),
    index('telegram_messages_order_idx').on(table.orderId).where(sql`${table.orderId} IS NOT NULL`),
    index('telegram_messages_chat_session_idx').on(table.chatSessionId).where(sql`${table.chatSessionId} IS NOT NULL`),
    index('telegram_messages_chat_idx').on(table.chatId),
    index('telegram_messages_chat_created_idx').on(table.chatId, table.createdAt),
    index('telegram_messages_telegram_user_idx').on(table.telegramUserId).where(sql`${table.telegramUserId} IS NOT NULL`),
    index('telegram_messages_telegram_message_idx').on(table.telegramMessageId).where(sql`${table.telegramMessageId} IS NOT NULL`),
    index('telegram_messages_update_id_idx').on(table.updateId).where(sql`${table.updateId} IS NOT NULL`),
    index('telegram_messages_webhook_idx').on(table.webhookId).where(sql`${table.webhookId} IS NOT NULL`),
    index('telegram_messages_direction_idx').on(table.direction),
    index('telegram_messages_type_idx').on(table.messageType),
    index('telegram_messages_status_idx').on(table.status),
    index('telegram_messages_language_idx').on(table.language),
    index('telegram_messages_file_id_idx').on(table.fileId).where(sql`${table.fileId} IS NOT NULL`),
    index('telegram_messages_spam_idx').on(table.spamScore).where(sql`${table.spamScore} > 70`),
    index('telegram_messages_created_idx').on(table.createdAt),
    index('telegram_messages_sent_idx').on(table.sentAt).where(sql`${table.sentAt} IS NOT NULL`),
    index('telegram_messages_deleted_idx').on(table.deletedAt).where(sql`${table.deletedAt} IS NULL`),
    index('telegram_messages_store_status_idx').on(table.storeId, table.status).where(sql`${table.storeId} IS NOT NULL`),
    index('telegram_messages_chat_direction_idx').on(table.chatId, table.direction),
    index('telegram_messages_chat_type_idx').on(table.chatId, table.messageType),

    check('chk_direction', sql`${table.direction} IN ('incoming', 'outgoing')`),
    check('chk_message_type', sql`${table.messageType} IN ('text', 'photo', 'sticker', 'contact', 'callback_query', 'command', 'video', 'document', 'audio', 'voice', 'location', 'other')`),
    check('chk_message_status', sql`${table.status} IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled')`),
    check('chk_language', sql`${table.language} IN ('ar', 'en', 'fr', 'es')`),
    check('chk_message_ownership', sql`NOT (${table.storeId} IS NULL AND ${table.customerId} IS NOT NULL)`),
    check('chk_telegram_message_id_positive', sql`${table.telegramMessageId} IS NULL OR ${table.telegramMessageId} > 0`),
    check('chk_reply_to_message_id_positive', sql`${table.replyToMessageId} IS NULL OR ${table.replyToMessageId} > 0`),
    check('chk_update_id_positive', sql`${table.updateId} IS NULL OR ${table.updateId} > 0`),
    check('chk_command_format', sql`${table.command} IS NULL OR (${table.command} GLOB '/*' AND length(${table.command}) <= 50)`),
    check('chk_content_length', sql`${table.content} IS NULL OR length(${table.content}) <= 4096`),
    check('chk_caption_length', sql`${table.caption} IS NULL OR length(${table.caption}) <= 1024`),
    check('chk_attachments_limit', sql`json_array_length(${table.attachments}) <= 10`),
    check('chk_buttons_limit', sql`json_array_length(${table.buttons}) <= 20`),
    check('chk_entities_limit', sql`json_array_length(${table.entities}) <= 100`),
    check('chk_retry_count_non_negative', sql`${table.retryCount} >= 0`),
    check('chk_spam_score_range', sql`${table.spamScore} BETWEEN 0 AND 100`),
    check('chk_sent_consistency', sql`(${table.status} = 'pending' AND ${table.sentAt} IS NULL) OR (${table.status} != 'pending')`),
    check('chk_delivered_consistency', sql`(${table.status} IN ('pending', 'sent') AND ${table.deliveredAt} IS NULL) OR (${table.status} NOT IN ('pending', 'sent'))`),
    check('chk_read_consistency', sql`(${table.status} IN ('pending', 'sent', 'delivered') AND ${table.readAt} IS NULL) OR (${table.status} NOT IN ('pending', 'sent', 'delivered'))`),
    check('chk_failure_consistency', sql`(${table.status} != 'failed' AND ${table.failureReason} IS NULL) OR (${table.status} = 'failed' AND ${table.failureReason} IS NOT NULL)`),
    check('chk_metadata_valid', sql`${table.metadata} IS NULL OR (json_valid(${table.metadata}) = 1 AND json_type(${table.metadata}) = 'object')`),
  ]
);

export type TelegramMessage = InferSelectModel<typeof telegramMessages>;
export type NewTelegramMessage = InferInsertModel<typeof telegramMessages>;

// ============================================
// 🛠️ الدوال المساعدة الصافية (Drizzle API Native)
// ============================================

export function createOutgoingMessage(chatId: string, content: string, options: Partial<NewTelegramMessage> = {}): NewTelegramMessage {
  return { id: crypto.randomUUID(), chatId, direction: 'outgoing', messageType: options.messageType || 'text', status: 'pending', content, storeId: options.storeId, customerId: options.customerId, buttons: options.buttons || [], inlineKeyboard: options.inlineKeyboard, replyKeyboard: options.replyKeyboard, replyToMessageId: options.replyToMessageId, language: options.language || 'ar', retryCount: 0, spamScore: 0, attachments: options.attachments || [], entities: options.entities || [], metadata: options.metadata || {}, createdAt: new Date(), updatedAt: new Date() };
}

export function createIncomingMessage(chatId: string, telegramUserId: string, telegramMessageId: number, content: string, options: Partial<NewTelegramMessage> = {}): NewTelegramMessage {
  return { id: crypto.randomUUID(), chatId, telegramUserId, telegramMessageId, direction: 'incoming', messageType: options.messageType || 'text', status: 'delivered', content, command: options.command, storeId: options.storeId, customerId: options.customerId, updateId: options.updateId, metadata: options.metadata || {}, language: options.language || 'ar', retryCount: 0, spamScore: 0, attachments: options.attachments || [], entities: options.entities || [], buttons: options.buttons || [], createdAt: new Date(), updatedAt: new Date() };
}

export function isCommand(message: TelegramMessage): boolean {
  return message.messageType === 'command' && !!message.command?.startsWith('/');
}

export function getCommandName(message: TelegramMessage): string | null {
  if (!isCommand(message) || !message.command) return null;
  return message.command.split(' ')[0].substring(1).toLowerCase();
}

export function getCommandArgs(message: TelegramMessage): string[] {
  if (!isCommand(message) || !message.command) return [];
  return message.command.split(' ').slice(1);
}

export function isCallbackQuery(message: TelegramMessage): boolean {
  return message.messageType === 'callback_query';
}

export function getCallbackData(message: TelegramMessage): string | null {
  if (!isCallbackQuery(message)) return null;
  return (message.metadata as TelegramMessageMetadata & { callback_data?: string })?.callback_data || null;
}

/**
 * ✅ تحديث حالة الرسالة بـ Type-Safe Drizzle API ملمع
 */
export async function updateMessageStatus(
  d1Database: D1Database,
  messageId: string,
  newStatus: MessageStatus,
  options: { telegramMessageId?: number; sentAt?: Date; deliveredAt?: Date; readAt?: Date; failureReason?: string; failureCode?: string; } = {}
): Promise<TelegramMessage> {
  const db = drizzle(d1Database);
  
  const updates: Partial<typeof telegramMessages.$inferInsert> = { 
    status: newStatus, 
    updatedAt: new Date() 
  };
  
  if (options.telegramMessageId) updates.telegramMessageId = options.telegramMessageId;
  if (newStatus === 'sent' && options.sentAt) updates.sentAt = options.sentAt;
  if (newStatus === 'delivered' && options.deliveredAt) updates.deliveredAt = options.deliveredAt;
  if (newStatus === 'read' && options.readAt) updates.readAt = options.readAt;
  if (newStatus === 'failed') {
    updates.failureReason = options.failureReason;
    updates.failureCode = options.failureCode;
  }
  
  const result = await db
    .update(telegramMessages)
    .set(updates)
    .where(eq(telegramMessages.id, messageId))
    .returning()
    .get();
  
  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Telegram message entity not found for status update')
    );
  }
  return result;
}

/**
 * ✅ زيادة عداد المحاولات بـ Drizzle Expression
 */
export async function incrementRetryCount(d1Database: D1Database, messageId: string, failureReason: string): Promise<TelegramMessage> {
  const db = drizzle(d1Database);
  
  const result = await db
    .update(telegramMessages)
    .set({
      retryCount: sql`${telegramMessages.retryCount} + 1`,
      lastRetryAt: new Date(),
      failureReason,
      updatedAt: new Date()
    })
    .where(eq(telegramMessages.id, messageId))
    .returning()
    .get();
  
  if (!result) {
    throw classifyError(
      new Error('BIZ_404: Telegram message entity not found for retry incrementation')
    );
  }
  return result;
}

/**
 * ✅ جلب رسائل الشات مع الـ Pagination والـ Tenant Isolation
 */
export async function getChatMessages(
  d1Database: D1Database,
  chatId: string,
  page: number = 1,
  limit: number = 50,
  direction?: MessageDirection
): Promise<{ messages: TelegramMessage[]; total: number }> {
  const db = drizzle(d1Database);
  const offset = (page - 1) * limit;
  
  const conditions = [eq(telegramMessages.chatId, chatId), isNull(telegramMessages.deletedAt)];
  if (direction) conditions.push(eq(telegramMessages.direction, direction));
  
  const baseCondition = and(...conditions);
  
  const messagesList = await db
    .select()
    .from(telegramMessages)
    .where(baseCondition)
    .orderBy(desc(telegramMessages.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
    
  const totalCount = await db
    .select({ count: count(telegramMessages.id) })
    .from(telegramMessages)
    .where(baseCondition)
    .get();
  
  return { 
    messages: messagesList, 
    total: totalCount?.count || 0 
  };
}

/**
 * ✅ جلب الرسائل المعلقة لإعادة المحاولة (Queue Processing)
 */
export async function getPendingMessages(d1Database: D1Database, limit: number = 100): Promise<TelegramMessage[]> {
  const db = drizzle(d1Database);
  
  return await db
    .select()
    .from(telegramMessages)
    .where(
      and(
        eq(telegramMessages.status, 'pending'),
        isNull(telegramMessages.deletedAt),
        sql`${telegramMessages.retryCount} < 5`
      )
    )
    .orderBy(telegramMessages.createdAt)
    .limit(limit)
    .all();
}

/**
 * ✅ تتبع رسائل الـ Spam ذات السكور العالي
 */
export async function getSpamMessages(d1Database: D1Database, threshold: number = 70): Promise<TelegramMessage[]> {
  const db = drizzle(d1Database);
  
  return await db
    .select()
    .from(telegramMessages)
    .where(
      and(
        sql`${telegramMessages.spamScore} > ${threshold}`,
        sql`${telegramMessages.status} != 'cancelled'`,
        isNull(telegramMessages.deletedAt)
      )
    )
    .orderBy(desc(telegramMessages.spamScore))
    .all();
}

/**
 * ✅ جلب آخر رسالة في المحادثة لتحديث الـ Preview في الفرونت إند
 */
export async function getLastMessageInChat(d1Database: D1Database, chatId: string, direction?: MessageDirection): Promise<TelegramMessage | null> {
  const db = drizzle(d1Database);
  
  const conditions = [eq(telegramMessages.chatId, chatId), isNull(telegramMessages.deletedAt)];
  if (direction) conditions.push(eq(telegramMessages.direction, direction));
  
  return await db
    .select()
    .from(telegramMessages)
    .where(and(...conditions))
    .orderBy(desc(telegramMessages.createdAt))
    .limit(1)
    .get() || null;
}

/**
 * ✅ إحصائيات الرسائل للـ Dashboard والتحليلات البيانية
 */
export async function getMessageStats(
  d1Database: D1Database,
  storeId: string,
  startDate: Date,
  endDate: Date
): Promise<{ total: number; incoming: number; outgoing: number; commands: number; callbacks: number }> {
  const db = drizzle(d1Database);
  
  const result = await db
    .select({
      total: count(telegramMessages.id),
      incoming: sql<number>`SUM(CASE WHEN ${telegramMessages.direction} = 'incoming' THEN 1 ELSE 0 END)`,
      outgoing: sql<number>`SUM(CASE WHEN ${telegramMessages.direction} = 'outgoing' THEN 1 ELSE 0 END)`,
      commands: sql<number>`SUM(CASE WHEN ${telegramMessages.messageType} = 'command' THEN 1 ELSE 0 END)`,
      callbacks: sql<number>`SUM(CASE WHEN ${telegramMessages.messageType} = 'callback_query' THEN 1 ELSE 0 END)`,
    })
    .from(telegramMessages)
    .where(
      and(
        eq(telegramMessages.storeId, storeId),
        between(telegramMessages.createdAt, startDate, endDate),
        isNull(telegramMessages.deletedAt)
      )
    )
    .get();
  
  return { 
    total: result?.total || 0, 
    incoming: result?.incoming || 0, 
    outgoing: result?.outgoing || 0, 
    commands: result?.commands || 0, 
    callbacks: result?.callbacks || 0 
  };
}