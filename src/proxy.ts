// src/proxy.ts
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // ✅ مؤقتاً: مرر كل الطلبات بدون أي معالجة
  return NextResponse.next();
}

export default proxy;