// src/lib/telegram/memory.ts

import { eq, and, desc, isNull } from 'drizzle-orm';
import type { DbInstance } from '@/lib/db';
import { chatSessions } from '@/lib/db/schema/chat-sessions';
import type { OnboardingSession } from './types';

type ChatSessionState = typeof chatSessions.$inferSelect['state'];

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
      .get(); // ✅ رجعناها .get() الاصلية لـ D1

    // عمل mapping آمن ونظيف للبيانات بدون any
    const rawState = record?.state as Record<string, unknown> | null;
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
        lastActivity: record?.lastActivityAt || new Date(),
        createdAt: record?.createdAt,
      },
    };
  } catch (error) {
    console.error('❌ [Memory Service] Error loading session:', error);
    return {
      session: { step: 'phone' },
      timestamps: {
        lastActivity: new Date(),
      },
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
    const dbState = sessionData as ChatSessionState;

    // 1️⃣ البحث عن أي جلسة نشطة وقائمة حالياً لهذا المستخدم
    const existing = await db
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

    if (existing) {
      // 2️⃣ إذا وجدت جلسة، قم بتحديثها فوراً بدلاً من إدراج سطر جديد يسبب التضارب
      await db
        .update(chatSessions)
        .set({
          state: dbState,
          lastActivityAt: timestamps?.lastActivity || now,
          updatedAt: now,
        })
        .where(eq(chatSessions.id, existing.id));
      
      console.log(`💾 [Memory Service] Session updated successfully for ${externalId} to step: ${sessionData.step}`);
    } else {
      // 3️⃣ إذا لم توجد جلسة من قبل، قم بإنشاء سطر جديد نظيف
      const sessionId = crypto.randomUUID();
      await db
        .insert(chatSessions)
        .values({
          id: sessionId,
          platform,
          externalId,
          state: dbState,
          lastActivityAt: timestamps?.lastActivity || now,
          createdAt: timestamps?.createdAt || now,
          updatedAt: now,
        });
      
      console.log(`💾 [Memory Service] New session created for ${externalId}`);
    }
  } catch (error) {
    console.error('❌ [Memory Service] Error saving/upserting session:', error);
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
  } catch (error) {
    console.error('❌ [Memory Service] Error deleting session:', error);
  }
}