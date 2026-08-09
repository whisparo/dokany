//src/workers/rate-limiter/src/index.ts

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { checkRateLimit, type RateLimitRequest } from './limiter';

type Bindings = {
  INTERNAL_SECRET: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS محدود
app.use('*', cors({
  origin: (origin) => {
    const allowed = ['https://dokany.com', 'https://www.dokany.com', 'http://localhost:3000'];
    return allowed.includes(origin) ? origin : '';
  },
  allowHeaders: ['Content-Type', 'X-RL-Token', 'X-RL-Identity', 'X-RL-Store', 'X-RL-Action'],
  maxAge: 86400,
}));

// 🔐 التحقق الأمني من الـ Token عبر متغيرات البيئة بـ Worker
app.use('*', async (c, next) => {
  if (c.req.path === '/health') return await next();
  
  const internalToken = c.req.header('X-RL-Token');
  const expectedSecret = c.env.INTERNAL_SECRET || 'CHANGE_ME_IN_WRANGLER_SECRETS';

  if (!internalToken || internalToken !== expectedSecret) {
    return c.json({ error: 'Unauthorized Access' }, 401);
  }
  await next();
});

// 🎯 نقطة الفحص المباشرة
app.post('/check', async (c) => {
  try {
    const body = await c.req.json<RateLimitRequest>();

    if (!body.action || !body.ip) {
      return c.json({ error: 'Missing required fields: action and ip' }, 400);
    }

    const result = await checkRateLimit(body, c.env);

    return c.json(
      {
        allowed: result.allowed,
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.resetAt,
        retryAfter: result.retryAfter,
        layer: result.layer,
      },
      result.allowed ? 200 : 429
    );
  } catch (error) {
    console.error('Rate limiter exception:', error);

    // Fail-Safe متوازن: إذا حدث عطل في Redis، اسمح للطلبات العادية، وارفض طلبات الأمان
    const body = await c.req.json<RateLimitRequest>().catch(() => ({ action: '' }));
    const isCritical = body.action?.startsWith('auth:');

    if (isCritical) {
      return c.json({ allowed: false, error: 'Service Unavailable' }, 503);
    }

    return c.json({ allowed: true, degraded: true }, 200);
  }
});

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

export default app;