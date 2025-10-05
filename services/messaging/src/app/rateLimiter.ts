import type { FastifyInstance, FastifyRequest } from 'fastify';

type RateKeyScope = 'ip' | 'device' | 'session' | 'user';

export interface RateLimiterOptions {
  global: {
    max: number;
    intervalMs: number;
    allowList?: string[];
  };
  routes?: Array<{
    method: string;
    url: string | RegExp;
    scope: RateKeyScope;
    max: number;
    intervalMs: number;
  }>;
}

interface BucketState {
  count: number;
  resetAt: number;
}

const makeBucketKey = (scope: RateKeyScope, request: FastifyRequest) => {
  const auth = (request as { auth?: import('../domain/types/auth.types').AuthContext }).auth;
  switch (scope) {
    case 'device':
      return auth ? `device:${auth.deviceId}` : request.headers['x-device-id']?.toString() ?? `device:${request.ip}`;
    case 'session':
      return auth ? `session:${auth.sessionId}` : request.headers['x-session-id']?.toString() ?? `session:${request.ip}`;
    case 'user':
      return auth ? `user:${auth.userId}` : request.headers['x-user-id']?.toString() ?? `user:${request.ip}`;
    case 'ip':
    default:
      return `ip:${request.ip ?? 'unknown'}`;
  }
};

const createLimiter = (max: number, intervalMs: number) => {
  const buckets = new Map<string, BucketState>();

  const take = (key: string) => {
    const now = Date.now();
    const state = buckets.get(key);
    if (!state || state.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + intervalMs });
      return { allowed: true };
    }
    if (state.count >= max) {
      return { allowed: false, retryAfterMs: Math.max(state.resetAt - now, 0) };
    }
    state.count += 1;
    return { allowed: true };
  };

  const clear = () => buckets.clear();
  return { take, clear };
};

export const registerRateLimiter = (app: FastifyInstance, options: RateLimiterOptions) => {
  const globalLimiter = createLimiter(options.global.max, options.global.intervalMs);
  const allow = new Set(options.global.allowList ?? []);
  const perRoute = (options.routes ?? []).map((route) => ({
    matcher: route.url instanceof RegExp ? route.url : new RegExp(`^${route.url}$`),
    method: route.method.toUpperCase(),
    scope: route.scope,
    limiter: createLimiter(route.max, route.intervalMs)
  }));

  app.addHook('onRequest', async (request, reply) => {
    if (!allow.has(request.ip)) {
      const result = globalLimiter.take(`global:${request.ip ?? 'unknown'}`);
      if (!result.allowed) {
        reply.code(429).send({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: { scope: 'global', retryAfterMs: result.retryAfterMs }
        });
        return reply;
      }
    }

    for (const route of perRoute) {
      if (route.method !== request.method || !route.matcher.test(request.url)) continue;
      const key = makeBucketKey(route.scope, request);
      const result = route.limiter.take(key);
      if (!result.allowed) {
        reply.code(429).send({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: {
            scope: route.scope,
            retryAfterMs: result.retryAfterMs,
            key
          }
        });
        return reply;
      }
    }
  });

  app.addHook('onClose', async () => {
    globalLimiter.clear();
    for (const route of perRoute) {
      route.limiter.clear();
    }
  });
};


