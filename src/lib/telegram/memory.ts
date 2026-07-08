// src/lib/telegram/memory.ts
import { eq, and, desc, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { schema } from '@/lib/db';

type ChatSessionState = typeof schema.chatSessions.$inferSelect['state'];

export interface SessionResult {
  session: ChatSessionState;
  timestamps: {
    lastActivity: Date;
    createdAt?: Date;
  };
}

export async function loadSession(
  env: { DB: D1Database }, // ✅ تمرير env بدلاً من استخدام db مباشر
  platform: 'telegram' | 'web',
  externalId: string
): Promise<SessionResult> {
  const db = getDb(env);
  try {
    const record = await db
      .select()
      .from(schema.chatSessions)
      .where(
        and(
          eq(schema.chatSessions.platform, platform),
          eq(schema.chatSessions.externalId, externalId),
          isNull(schema.chatSessions.deletedAt)
        )
      )
      .orderBy(desc(schema.chatSessions.createdAt))
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
  env: { DB: D1Database },
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState,
  timestamps?: { lastActivity?: Date; createdAt?: Date }
): Promise<void> {
  const db = getDb(env);
  try {
    const now = new Date();

    await db
      .insert(schema.chatSessions)
      .values({
        id: crypto.randomUUID(), // ✅ يجب توليد ID لأن العمود primary key
        platform,
        externalId,
        state: sessionData,
        lastActivityAt: timestamps?.lastActivity || now,
        createdAt: timestamps?.createdAt || now,
        updatedAt: now,
        timestamps: {}, // ✅ حقل timestamps مطلوب في السكيما، ضع {} افتراضيًا
      })
      .onConflictDoUpdate({
        target: [schema.chatSessions.platform, schema.chatSessions.externalId],
        set: {
          state: sessionData,
          lastActivityAt: timestamps?.lastActivity || now,
          updatedAt: now,
        },
      });
  } catch (error) {
    console.error('❌ [Memory Service] Error saving session:', error);
    throw error;
  }
}

export async function updateSession(
  env: { DB: D1Database },
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: ChatSessionState
): Promise<void> {
  await saveSession(env, platform, externalId, sessionData);
}

export async function deleteSession(
  env: { DB: D1Database },
  platform: 'telegram' | 'web',
  externalId: string
): Promise<void> {
  const db = getDb(env);
  try {
    await db
      .update(schema.chatSessions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.chatSessions.platform, platform),
          eq(schema.chatSessions.externalId, externalId),
          isNull(schema.chatSessions.deletedAt)
        )
      );
  } catch (error) {
    console.error('❌ [Memory Service] Error deleting session:', error);
  }
}