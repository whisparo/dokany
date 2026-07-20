// app/api/auth/[...all]/route.ts

import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * مغلف ذكي ومأمن لتوجيه طلبات الـ Auth
 */
async function handleAuthRequest(request: NextRequest) {
  try {
    // 🚀 الحل هنا: جلب الـ Handlers عند تنفيذ الـ Request فقط وليس أثناء الـ Build
    const authHandlers = toNextJsHandler(auth);
    const method = request.method as keyof typeof authHandlers;
    const handler = authHandlers[method];

    if (!handler) {
      return NextResponse.json({ error: `Method ${request.method} not allowed` }, { status: 405 });
    }

    return await handler(request);
  } catch (error) {
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