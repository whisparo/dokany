//src/app/api/ping/route.ts
import { NextResponse } from 'next/server';
export const runtime = 'edge';
export async function GET() {
  return new NextResponse('OK', { status: 200 });
}