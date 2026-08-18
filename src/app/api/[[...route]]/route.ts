// src/app/api/[[...route]]/route.ts
import { Hono } from 'hono';
import { handle } from 'hono/vercel'; // أو الـ adapter اللي بتستخدمه لـ Cloudflare/Next
import testAlertsRouter from '@/workers/routes/test-alerts';

const app = new Hono().basePath('/api');

// 🔗 ربط الـ Router
app.route('/', testAlertsRouter);

export const GET = handle(app);
export const POST = handle(app);