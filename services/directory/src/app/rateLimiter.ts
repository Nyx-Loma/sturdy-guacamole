import type { FastifyInstance } from 'fastify';

interface RateLimiterOptions {
  max: number;
  intervalMs: number;
  allowList?: string[];
}

interface BucketState {
  count: number;
  resetAt: number;
}

const createKey = (ip: string | undefined) => ip ?? 'unknown';

export const registerRateLimiter = (app: FastifyInstance, options: RateLimiterOptions) => {
  const buckets = new Map<string, BucketState>();
  const allow = new Set(options.allowList ?? []);

  app.addHook('onRequest', async (request, reply) => {
    const ip = createKey(request.ip);
    if (allow.has(ip)) return;

    const now = Date.now();
    const existing = buckets.get(ip);

    if (!existing || existing.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + options.intervalMs });
      return;
    }

    if (existing.count >= options.max) {
      reply.code(429).send({ error: 'RATE_LIMITED', retry_after_ms: Math.max(existing.resetAt - now, 0) });
      return reply;
    }

    existing.count += 1;
  });

  app.addHook('onClose', async () => {
    buckets.clear();
  });
};


