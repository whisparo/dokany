// src/lib/telegram/memory.ts

import { eq, and, desc, isNull } from 'drizzle-orm';
import type { DbInstance } from '@/lib/db'; // ✅ النوع الصحيح
import { chatSessions } from '@/lib/db/schema/chat-sessions';

type ChatSessionState = typeof chatSessions.$inferSelect['state'];

export interface SessionResult {
  session: ChatSessionState;
  timestamps: {
    lastActivity: Date;
    createdAt?: Date;
  };
}

export async function loadSession(
  db: DbInstance, // ✅ الآن يتطابق مع ما يُرجعه getDb
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

export async function saveSession(
  db: DbInstance, // ✅ نوع دقيق
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

export async function updateSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState
): Promise<void> {
  await saveSession(db, platform, externalId, sessionData);
}

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