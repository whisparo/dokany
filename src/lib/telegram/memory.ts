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

/**
 * جلب الجلسة الحالية وإرجاع بيانات الجلسة مباشرة لتتوافق مع الـ Adapter والـ Handlers
 */
export async function getSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string
): Promise<OnboardingSession | null> {
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

    if (!record || !record.state) {
      return null;
    }

    const rawState = record.state as Record<string, unknown>;

    const sessionState: OnboardingSession = {
      step: (rawState.step as OnboardingSession['step']) || 'phone',
      phone: rawState.phone as string | undefined,
      name: rawState.name as string | undefined,
      email: rawState.email as string | undefined,
      storeName: rawState.storeName as string | undefined,
      nicheAttempts: rawState.nicheAttempts as number | undefined,
    };

    return sessionState;
  } catch (error) {
    console.error('❌ [Memory Service] Error fetching session:', error);
    return null;
  }
}

/**
 * loadSession للاحتفاظ بالـ Timestamps إن تم استخدامها
 */
export async function loadSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string
): Promise<SessionResult> {
  const session = await getSession(db, platform, externalId);

  return {
    session: session || { step: 'phone' },
    timestamps: { lastActivity: new Date() },
  };
}

/**
 * حفظ أو تحديث الجلسة (Upsert) - كود نظيف وبدون Type Hacks
 */
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

    const dbTimestamps: ChatSessionTimestamps = {
      firstMessageAt: timestamps?.createdAt ? timestamps.createdAt.getTime() : now.getTime(),
      lastMessageAt: timestamps?.lastActivity ? timestamps.lastActivity.getTime() : now.getTime(),
    };

    const lastActivity = timestamps?.lastActivity ?? now;
    const createdAt = timestamps?.createdAt ?? now;

    await db
      .insert(chatSessions)
      .values({
        id: sessionId,
        platform,
        externalId,
        state: dbState,
        timestamps: dbTimestamps,
        lastActivityAt: lastActivity,
        createdAt: createdAt,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: [chatSessions.platform, chatSessions.externalId],
        set: {
          state: dbState,
          timestamps: dbTimestamps,
          lastActivityAt: lastActivity,
          updatedAt: now,
          deletedAt: null,
        },
      });

    console.log(`💾 [Memory Service] Session saved successfully for ${externalId}`);
  } catch (error) {
    console.error('❌ [Memory Service] Error saving session:', error);
    throw error;
  }
}

/**
 * تحديث الجلسة الحالية
 */
export async function updateSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string,
  sessionData: OnboardingSession
): Promise<void> {
  await saveSession(db, platform, externalId, sessionData);
}

/**
 * حذف الجلسة (Soft-Delete)
 */
export async function deleteSession(
  db: DbInstance,
  platform: 'telegram' | 'web',
  externalId: string
): Promise<void> {
  try {
    const now = new Date();

    await db
      .update(chatSessions)
      .set({
        deletedAt: now,
        updatedAt: now,
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