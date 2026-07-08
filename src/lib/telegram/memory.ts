// src/lib/telegram/memory.ts
/**
 * ============================================================================
 * 🧠 Telegram Session Memory Manager (Unified Chat Sessions)
 * ============================================================================
 * إدارة جلسات وحالات مستخدمي البوت بناءً على جدول chat_sessions الموحد.
 */

import { db } from '@/lib/db/db';
import { chatSessions } from '@/lib/db/schema/chat-sessions';
import { eq, and, desc, isNull } from 'drizzle-orm';

// استخراج نوع الـ State بالملي من السكيما لمنع الـ any تماماً والالتزام بالـ Types
type ChatSessionState = typeof chatSessions.$inferSelect['state'];

export interface SessionResult {
  session: ChatSessionState;
  timestamps: {
    lastActivity: Date;
    createdAt?: Date;
  };
}

/**
 * تحميل جلسة مستخدم من قاعدة البيانات (يقرأ الجلسة النشطة والغير محذوفة soft deleted)
 */
export async function loadSession(
  platform: 'telegram' | 'web',
  externalId: string
): Promise<SessionResult> {
  try {
    const record = await db.query.chatSessions.findFirst({
      where: and(
        eq(chatSessions.platform, platform),
        eq(chatSessions.externalId, externalId),
        isNull(chatSessions.deletedAt) // قراءة الجلسات النشطة فقط
      ),
      orderBy: [desc(chatSessions.createdAt)],
    });

    return {
      // إذا لم توجد جلسة، نرجع كائن فارغ متوافق مع النوع
      session: record?.state || {},
      timestamps: {
        lastActivity: record?.lastActivityAt || new Date(),
        createdAt: record?.createdAt,
      },
    };
  } catch (error) {
    console.error('❌ [Memory Service] Error loading session:', error);
    return {
      session: {},
      timestamps: {
        lastActivity: new Date(),
      },
    };
  }
}

/**
 * حفظ أو تحديث جلسة مستخدم في قاعدة البيانات (Upsert Pattern)
 * تعتمد على الـ Unique Index المركب: (platform, external_id)
 * ✅ تم إزالة `where` من `onConflictDoUpdate` لأن الفهرس أصبح دائماً (بدون شرط)
 */
export async function saveSession(
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState,
  timestamps?: { lastActivity?: Date; createdAt?: Date }
): Promise<void> {
  try {
    const now = new Date();

    await db
      .insert(chatSessions)
      .values({
        platform,
        externalId,
        state: sessionData,
        lastActivityAt: timestamps?.lastActivity || now,
        createdAt: timestamps?.createdAt || now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        // ✅ الفهرس الآن ثابت ولا يحتوي على where، لذا نستطيع استخدامه مباشرة
        target: [chatSessions.platform, chatSessions.externalId],
        set: {
          state: sessionData,
          lastActivityAt: timestamps?.lastActivity || now,
          updatedAt: now,
        },
      });
  } catch (error) {
    console.error('❌ [Memory Service] Error saving/upserting session:', error);
    throw error;
  }
}

/**
 * تحديث جلسة مستخدم موجودة
 */
export async function updateSession(
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState
): Promise<void> {
  await saveSession(platform, externalId, sessionData);
}

/**
 * حذف جلسة مستخدم (Soft Delete بناءً على معمارية السنيور المكتوبة في السكيما)
 */
export async function deleteSession(
  platform: 'telegram' | 'web',
  externalId: string
): Promise<void> {
  try {
    await db
      .update(chatSessions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatSessions.platform, platform),
          eq(chatSessions.externalId, externalId),
          isNull(chatSessions.deletedAt)
        )
      );
  } catch (error) {
    console.error('❌ [Memory Service] Error deleting session:', error);
  }
}