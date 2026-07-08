// src/lib/validations/telegram.ts
import { z } from 'zod';

// ╔════════════════════════════════════════════════════════════╗
// ║  📱 TELEGRAM – نظام التحقق من رسائل تيليجرام              ║
// ║  📌 يتحقق من "الشكل" والقيود المنطقية الثابتة.              ║
// ║     منطق الربط مع المتجر/العميل في الخدمة.                 ║
// ╚════════════════════════════════════════════════════════════╝

// 📌 الثوابت
const CONTENT_MAX = 4096; // حد تيليجرام للرسالة الواحدة
const COMMAND_MAX = 50;
const BUTTONS_MAX = 100; // أقصى عدد أزرار في الكيبورد

// ============================================================
// 🆕 CREATE TELEGRAM MESSAGE – تسجيل رسالة جديدة
// ============================================================
export const createTelegramMessageSchema = z.object({
  storeId: z.string().uuid('معرف المتجر غير صالح').optional(),
  customerId: z.string().uuid('معرف العميل غير صالح').optional(),
  chatId: z.string().trim().min(1, 'معرف المحادثة مطلوب')
    .regex(/^-?\d+$/, 'معرف المحادثة يجب أن يكون رقماً صحيحاً'),
  telegramUserId: z.string().trim().optional(),
  direction: z.enum(['incoming', 'outgoing']),
  messageType: z.enum(['text', 'photo', 'sticker', 'contact', 'callback_query', 'command', 'other']),
  content: z.string().max(CONTENT_MAX).optional(),
  command: z.string().trim().max(COMMAND_MAX).optional(),
  telegramMessageId: z.number().int().positive().optional(),
  replyToMessageId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  buttons: z.array(z.object({
    text: z.string().trim().min(1),
    callback_data: z.string().max(64).optional(),
  })).max(BUTTONS_MAX).optional(),
  processedAt: z.coerce.date().optional(),
  processingError: z.string().max(500).optional(),
}).strict();

export type CreateTelegramMessageInput = z.infer<typeof createTelegramMessageSchema>;

// ============================================================
// ✏️ UPDATE TELEGRAM MESSAGE – تحديث بيانات الرسالة
// ============================================================
export const updateTelegramMessageSchema = z.object({
  processedAt: z.coerce.date(),
  processingError: z.string().max(500).optional(),
}).strict();

export type UpdateTelegramMessageInput = z.infer<typeof updateTelegramMessageSchema>;