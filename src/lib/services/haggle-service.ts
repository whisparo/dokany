//src/lib/services/haggle-service.ts

import { eq, and, sql, isNull } from 'drizzle-orm';
import { 
  haggleSessions, 
  type HaggleSession, 
  type CounterOffer, 
  type HaggleStrategy, 
  type HaggleStatus 
} from '@/lib/db/schema/haggle-sessions';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@/lib/db/schema';

export type DB = DrizzleD1Database<typeof schema>;

export interface CreateHaggleSessionInput {
  storeId: string;
  productId: string;
  customerId?: string;
  originalPrice: string;   // السعر الأصلي بالقروش كـ string (مثل "10000" لـ 100 جنيه)
  minAllowedPrice: string; // الحد الأدنى المسموح به للبائع
  initialOffer: string;    // عرض المشتري الأول
  maxRounds?: number;
  durationInMinutes?: number;
  strategy?: HaggleStrategy;
}

export interface SubmitOfferInput {
  sessionId: string;
  customerId?: string;
  offeredPrice: string;    // العرض الجديد من المشتري
  message?: string;
}

export interface HaggleResponse {
  success: boolean;
  session: HaggleSession;
  botMessage?: string;
  botCounterPrice?: string;
  error?: string;
}

export class HaggleService {
  constructor(private db: DB) {}

  /**
   * 🔑 توليد رمز فريد للجلسة (e.g. HAG-A1B2C3)
   */
  private generateSessionCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'HAG-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * 🚀 إنشاء جلسة مساومة جديدة
   */
  async createSession(input: CreateHaggleSessionInput): Promise<HaggleResponse> {
    const origPrice = BigInt(input.originalPrice);
    const minPrice = BigInt(input.minAllowedPrice);
    const initOffer = BigInt(input.initialOffer);

    // 1. التحقق المنطقي من الأسعار
    if (minPrice <= BigInt(0) || origPrice < minPrice) {
      throw new Error('إعدادات الحد الأدنى أو السعر الأصلي غير صحيحة');
    }

    if (initOffer >= origPrice) {
      throw new Error('عرضك يطابق أو يتجاوز السعر الأصلي بالفعل');
    }

    // 2. فحص وجود جلسة نشطة سابقة لنفس العميل والمنتج
    if (input.customerId) {
      const [existing] = await this.db
        .select()
        .from(haggleSessions)
        .where(
          and(
            eq(haggleSessions.customerId, input.customerId),
            eq(haggleSessions.productId, input.productId),
            isNull(haggleSessions.deletedAt)
          )
        )
        .limit(1);

      if (existing && (existing.status === 'active' || existing.status === 'counter_offered')) {
        return {
          success: true,
          session: existing,
          botMessage: 'لديك جلسة مساومة نشطة بالفعل لهذا المنتج.',
        };
      }
    }

    // 3. احتساب تاريخ الانتهاء (افتراضياً 30 دقيقة)
    const durationMs = (input.durationInMinutes || 30) * 60 * 1000;
    const expiresAt = new Date(Date.now() + durationMs);
    const strategy: HaggleStrategy = input.strategy || 'friendly';

    const initialHistory: CounterOffer[] = [
      {
        from: 'customer',
        price: input.initialOffer,
        timestamp: new Date().toISOString(),
      },
    ];

    // 4. معالجة العرض الأول بواسطة الـ Bot
    const botEval = this.evaluateOffer({
      origPrice,
      minPrice,
      offer: initOffer,
      round: 1,
      maxRounds: input.maxRounds || 5,
      strategy,
    });

    let status: HaggleStatus = 'counter_offered';
    let finalPrice: string | null = null;
    let discountAmount = '0';

    if (botEval.accepted) {
      status = 'accepted';
      finalPrice = initOffer.toString();
      discountAmount = (origPrice - initOffer).toString();
      initialHistory.push({
        from: 'bot',
        price: initOffer.toString(),
        message: botEval.message,
        timestamp: new Date().toISOString(),
        accepted: true,
      });
    } else if (botEval.rejected) {
      status = 'rejected';
      initialHistory.push({
        from: 'bot',
        price: '0',
        message: botEval.message,
        timestamp: new Date().toISOString(),
        accepted: false,
      });
    } else if (botEval.counterPrice) {
      initialHistory.push({
        from: 'bot',
        price: botEval.counterPrice.toString(),
        message: botEval.message,
        timestamp: new Date().toISOString(),
      });
    }

    // 5. حفظ الجلسة في قاعدة البيانات
    const [newSession] = await this.db
      .insert(haggleSessions)
      .values({
        sessionCode: this.generateSessionCode(),
        storeId: input.storeId,
        productId: input.productId,
        customerId: input.customerId,
        originalPrice: input.originalPrice,
        minAllowedPrice: input.minAllowedPrice,
        currentOffer: botEval.counterPrice ? botEval.counterPrice.toString() : input.initialOffer,
        counterOffers: initialHistory,
        roundsCount: 1,
        maxRounds: input.maxRounds || 5,
        status,
        finalPrice,
        discountAmount,
        strategyUsed: strategy,
        expiresAt,
      })
      .returning();

    return {
      success: true,
      session: newSession,
      botMessage: botEval.message,
      botCounterPrice: botEval.counterPrice?.toString(),
    };
  }

  /**
   * 💬 تقديم عرض جديد من العميل داخل جلسة قائمة
   */
  async submitOffer(input: SubmitOfferInput): Promise<HaggleResponse> {
    const [session] = await this.db
      .select()
      .from(haggleSessions)
      .where(
        and(
          eq(haggleSessions.id, input.sessionId),
          isNull(haggleSessions.deletedAt)
        )
      )
      .limit(1);

    if (!session) {
      return { success: false, session: null as unknown as HaggleSession, error: 'جلسة المساومة غير موجودة' };
    }

    // فحص الفعالية وانقضاء الوقت
    if (session.status !== 'active' && session.status !== 'counter_offered') {
      return { success: false, session, error: 'هذه الجلسة غير نشطة مغلقة بالفعل' };
    }

    if (new Date(session.expiresAt) < new Date()) {
      await this.db
        .update(haggleSessions)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(haggleSessions.id, session.id));

      return { success: false, session, error: 'انتهت صلاحية جلسة المساومة' };
    }

    const currentRound = session.roundsCount + 1;
    const newOfferPrice = BigInt(input.offeredPrice);
    const origPrice = BigInt(session.originalPrice);
    const minPrice = BigInt(session.minAllowedPrice);
    const strategy = session.strategyUsed || 'friendly';

    const updatedHistory: CounterOffer[] = [
      ...session.counterOffers,
      {
        from: 'customer',
        price: input.offeredPrice,
        message: input.message,
        timestamp: new Date().toISOString(),
      },
    ];

    // تقييم العرض بواسطة الـ Bot
    const botEval = this.evaluateOffer({
      origPrice,
      minPrice,
      offer: newOfferPrice,
      round: currentRound,
      maxRounds: session.maxRounds,
      strategy,
    });

    let newStatus: HaggleStatus = 'counter_offered';
    let finalPrice = session.finalPrice;
    let discountAmount = session.discountAmount;

    if (botEval.accepted) {
      newStatus = 'accepted';
      finalPrice = newOfferPrice.toString();
      discountAmount = (origPrice - newOfferPrice).toString();
      updatedHistory.push({
        from: 'bot',
        price: newOfferPrice.toString(),
        message: botEval.message,
        timestamp: new Date().toISOString(),
        accepted: true,
      });
    } else if (botEval.rejected) {
      newStatus = 'rejected';
      updatedHistory.push({
        from: 'bot',
        price: '0',
        message: botEval.message,
        timestamp: new Date().toISOString(),
        accepted: false,
      });
    } else if (botEval.counterPrice) {
      updatedHistory.push({
        from: 'bot',
        price: botEval.counterPrice.toString(),
        message: botEval.message,
        timestamp: new Date().toISOString(),
      });
    }

    // تحديث الجلسة
    const [updatedSession] = await this.db
      .update(haggleSessions)
      .set({
        roundsCount: currentRound,
        status: newStatus,
        currentOffer: botEval.counterPrice ? botEval.counterPrice.toString() : input.offeredPrice,
        counterOffers: updatedHistory,
        finalPrice,
        discountAmount,
        updatedAt: new Date(),
      })
      .where(eq(haggleSessions.id, session.id))
      .returning();

    return {
      success: true,
      session: updatedSession,
      botMessage: botEval.message,
      botCounterPrice: botEval.counterPrice?.toString(),
    };
  }

  /**
   * 🧠 خوارزمية التفاوض وتقييم العروض بناءً على الاستراتيجية والـ Rounds
   */
  private evaluateOffer(params: {
    origPrice: bigint;
    minPrice: bigint;
    offer: bigint;
    round: number;
    maxRounds: number;
    strategy: HaggleStrategy;
  }): { accepted: boolean; rejected: boolean; counterPrice?: bigint; message: string } {
    const { origPrice, minPrice, offer, round, maxRounds, strategy } = params;

    // 1. إذا كان العرض أقل من الحد الأدنى المقبول للبائع
    if (offer < minPrice) {
      // لو دي أخر جولة، ارفض الجلسة
      if (round >= maxRounds) {
        return {
          accepted: false,
          rejected: true,
          message: 'للأسف هذا السعر أقل من حدودنا المسموح بها ولا يمكننا قبوله.',
        };
      }

      // حساب عرض مضاد من البوت يتدرج باتجاه الحد الأدنى بناءً على الاستراتيجية
      const gap = origPrice - minPrice;
      let stepFactor = 50n; // default friendly

      if (strategy === 'aggressive') stepFactor = 25n;
      if (strategy === 'middle_ground') stepFactor = 40n;

      // تقليل السعر تدريجياً مع تقدم الـ Rounds
      const progressBonus = (BigInt(round) * 10n);
      const discountRatio = stepFactor + progressBonus; 
      let counterPrice = origPrice - (gap * discountRatio) / 100n;

      if (counterPrice < minPrice) counterPrice = minPrice;

      return {
        accepted: false,
        rejected: false,
        counterPrice,
        message: 'عرضك غير كافٍ، لكن يمكننا تقديم هذا السعر كحل وسط.',
      };
    }

    // 2. العرض أعلى من أو يساوي الحد الأدنى المسموح
    return {
      accepted: true,
      rejected: false,
      message: 'مبارك! تم قبول عرضك بنجاح.',
    };
  }
}