// app/api/auth/[...all]/route.ts

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse, type NextRequest } from 'next/server';

// جلب الـ Object اللي جواه معالجات الـ Methods منفصلة
const authHandlers = toNextJsHandler(auth);

/**
 * مغلف ذكي ومأمن لتوجيه طلبات الـ Auth ممتثل للدستور 8.0
 */
async function handleAuthRequest(request: NextRequest) {
  try {
    const method = request.method as keyof typeof authHandlers;
    const handler = authHandlers[method];

    // التحقق إن الميثود مدعومة وليها معالج جوه الـ Better-Auth
    if (!handler) {
      return NextResponse.json({ error: `Method ${request.method} not allowed` }, { status: 405 });
    }

    // استدعاء المعالج الخاص بالميثود الحالية (GET أو POST...) وتمرير الـ Request
    return await handler(request);
  } catch (error) {
    // 🏛️ النظام لا يموت بصمت عند بوابات الحماية
    console.error('🚨 [Auth Endpoint Exception]:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Authentication infrastructure failure',
        correlationId: request.headers.get('x-correlation-id') || 'unknown'
      },
      { status: 500 }
    );
  }
}

export { handleAuthRequest as GET, handleAuthRequest as POST };