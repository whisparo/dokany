// src/app/api/auth/session/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
/**
 * GET /api/auth/session
 * يعيد بيانات الجلسة الحالية للمستخدم (لايف) مع تأمين تفتيت الاستثناءات
 */
export async function GET(request: NextRequest) {
  try {
    // 🧠 Better-Auth على الـ Edge بيحتاج يقرأ الـ headers والسياق بشكل كامل
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return NextResponse.json({
      user: session?.user || null,
      session: session || null,
    });
  } catch (error) {
    // 🏛️ ممتثل للدستور 8.0: تسجيل الأخطاء البنية التحتية لحماية الحافة
    console.error('❌ [Session API Infrastructure Error]:', error);
    
    return NextResponse.json(
      { 
        user: null, 
        session: null, 
        error: 'Authentication infrastructure failure',
        correlationId: request.headers.get('x-correlation-id') || 'unknown'
      },
      { status: 500 }
    );
  }
}