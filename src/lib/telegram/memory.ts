// src/lib/telegram/memory.ts

import { eq, and, desc, isNull } from 'drizzle-orm';
import type { DbInstance } from '@/lib/db';
import { chatSessions } from '@/lib/db/schema/chat-sessions';
import type { OnboardingSession } from './types';

type ChatSessionState = typeof chatSessions.$inferSelect['state'];
type ChatSessionTimestamps = typeof chatSessions.$inferSelect['timestamps'];

export interface SessionResult {
  session: OnboardingSession;
  timestamps: {
    lastActivity: Date;
    createdAt?: Date;
  };
}

export async function loadSession(
  db: DbInstance,
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
      .get();

    if (!record) {
      return {
        session: { step: 'phone' },
        timestamps: { lastActivity: new Date() },
      };
    }

    const rawState = record.state as Record<string, unknown> | null;
    const sessionState: OnboardingSession = {
      step: (rawState?.step as OnboardingSession['step']) || 'phone',
      phone: rawState?.phone as string | undefined,
      name: rawState?.name as string | undefined,
      storeName: rawState?.storeName as string | undefined,
      nicheAttempts: rawState?.nicheAttempts as number | undefined,
    };

    return {
      session: sessionState,
      timestamps: {
        lastActivity: record.lastActivityAt || new Date(),
        createdAt: record.createdAt,
      },
    };
  } catch (error) {
    console.error('❌ [Memory Service] Error loading session:', error);
    return {
      session: { step: 'phone' },
      timestamps: { lastActivity: new Date() },
    };
  }
}

export async function saveSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: OnboardingSession,
  timestamps?: { lastActivity?: Date; createdAt?: Date }
): Promise<void> {
  try {
    const now = new Date();
    const sessionId = crypto.randomUUID();
    const dbState = sessionData as ChatSessionState;
    
    // 🛡️ [الحل السحري لـ D1]: نمرر أوبجكت timestamps صريح ومتوافق مع الـ JSON Check Constraint
    const dbTimestamps: ChatSessionTimestamps = {
      firstMessageAt: timestamps?.createdAt ? timestamps.createdAt.getTime() : now.getTime(),
      lastMessageAt: timestamps?.lastActivity ? timestamps.lastActivity.getTime() : now.getTime(),
    };

    await db
      .insert(chatSessions)
      .values({
        id: sessionId,
        platform,
        externalId,
        state: dbState,
        timestamps: dbTimestamps, // مبعوت صراحة كـ Object عشان الـ Drizzle يحوله لـ JSON سليم
        lastActivityAt: timestamps?.lastActivity || now,
        createdAt: timestamps?.createdAt || now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [chatSessions.platform, chatSessions.externalId],
        set: {
          state: dbState,
          timestamps: dbTimestamps, // تحديث صريح أيضاً
          lastActivityAt: timestamps?.lastActivity || now,
          updatedAt: now,
          deletedAt: null, // تأمين الجلسات المحذوفة
        },
      });

    console.log(`💾 [Memory Service] Session upserted successfully for ${externalId}`);
  } catch (error) {
    console.error('❌ [Memory Service] Error saving session:', error);
    throw error;
  }
}

export async function updateSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: OnboardingSession
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
    console.log(`🗑️ [Memory Service] Session Soft-Deleted successfully for ${externalId}`);
  } catch (error) {
    console.error('❌ [Memory Service] Error deleting session:', error);
  }
}