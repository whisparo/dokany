// src/lib/telegram/memory.ts

import { eq, and, desc, isNull } from 'drizzle-orm';
import type { DbInstance } from '@/lib/db'; // ✅ استيراد النوع الموحد
import { chatSessions } from '@/lib/db/schema/chat-sessions';

type ChatSessionState = typeof chatSessions.$inferSelect['state'];

export interface SessionResult {
  session: ChatSessionState;
  timestamps: {
    lastActivity: Date;
    createdAt?: Date;
  };
}

/**
 * تحميل جلسة مستخدم من قاعدة البيانات
 */
export async function loadSession(
  db: DbInstance, // ✅ استخدام DbInstance بدلاً من DrizzleD1Database
  platform: 'telegram' | 'web',
  externalId: string
): Promise<SessionResult> {
  try {
    const record = await db
      .select()
      .from(chatSessions)
      .where(
        and(
          eq(chatSessions.platform, platform),
          eq(chatSessions.externalId, externalId),
          isNull(chatSessions.deletedAt)
        )
      )
      .orderBy(desc(chatSessions.createdAt))
      .limit(1)
      .then(rows => rows[0] || null);

    return {
      session: (record?.state as ChatSessionState) || {},
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
 * حفظ أو تحديث جلسة مستخدم في قاعدة البيانات
 */
export async function saveSession(
  db: DbInstance, // ✅ استخدام DbInstance
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState,
  timestamps?: { lastActivity?: Date; createdAt?: Date }
): Promise<void> {
  try {
    const now = new Date();
    const sessionId = crypto.randomUUID();

    await db
      .insert(chatSessions)
      .values({
        id: sessionId,
        platform,
        externalId,
        state: sessionData,
        lastActivityAt: timestamps?.lastActivity || now,
        createdAt: timestamps?.createdAt || now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
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
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState
): Promise<void> {
  await saveSession(db, platform, externalId, sessionData);
}

/**
 * حذف جلسة مستخدم (soft delete)
 */
export async function deleteSession(
  db: DbInstance,
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