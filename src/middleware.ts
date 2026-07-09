// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

// ✅ هذا هو الحل المؤقت: نمرر كل الطلبات بدون أي معالجة
export function middleware(request: NextRequest) {
  return NextResponse.next();
}