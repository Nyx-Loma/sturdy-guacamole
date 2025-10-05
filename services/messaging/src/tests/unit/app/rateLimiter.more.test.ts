import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerRateLimiter } from '../../../app/rateLimiter';

describe('rateLimiter (more branches)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    app.decorate('messagingMetrics', { rateLimitExceeded: { inc: () => {} } } as any);
    app.get('/test', async () => 'ok');
    app.get('/other', async () => 'ok');
  });

  afterEach(async () => {
    await app.close();
  });

  it('bypasses global limiter via allowList', async () => {
    registerRateLimiter(app, {
      global: { max: 1, intervalMs: 1000, allowList: ['127.0.0.1'] },
      routes: [],
    });
    const r1 = await app.inject({ method: 'GET', url: '/test', remoteAddress: '127.0.0.1' });
    const r2 = await app.inject({ method: 'GET', url: '/test', remoteAddress: '127.0.0.1' });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
  });

  it('regex route does not match different path', async () => {
    registerRateLimiter(app, {
      global: { max: 100, intervalMs: 1000 },
      routes: [{ method: 'GET', url: /^\/test$/, scope: 'ip', max: 1, intervalMs: 1000 }],
    });
    const a = await app.inject({ method: 'GET', url: '/other', remoteAddress: '1.2.3.4' });
    const b = await app.inject({ method: 'GET', url: '/other', remoteAddress: '1.2.3.4' });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });

  it('device scope falls back to ip when no header', async () => {
    registerRateLimiter(app, {
      global: { max: 100, intervalMs: 1000 },
      routes: [{ method: 'GET', url: '/test', scope: 'device', max: 1, intervalMs: 1000 }],
    });
    const first = await app.inject({ method: 'GET', url: '/test', remoteAddress: '5.5.5.5' });
    const second = await app.inject({ method: 'GET', url: '/test', remoteAddress: '5.5.5.5' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it('session scope uses header key', async () => {
    registerRateLimiter(app, {
      global: { max: 100, intervalMs: 1000 },
      routes: [{ method: 'GET', url: '/test', scope: 'session', max: 1, intervalMs: 1000 }],
    });
    const h = { 'x-session-id': 'sess-1' };
    const first = await app.inject({ method: 'GET', url: '/test', headers: h, remoteAddress: '9.9.9.9' });
    const second = await app.inject({ method: 'GET', url: '/test', headers: h, remoteAddress: '9.9.9.9' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it('user scope uses header key and distinct across users', async () => {
    registerRateLimiter(app, {
      global: { max: 100, intervalMs: 1000 },
      routes: [{ method: 'GET', url: '/test', scope: 'user', max: 1, intervalMs: 1000 }],
    });
    const a1 = await app.inject({ method: 'GET', url: '/test', headers: { 'x-user-id': 'u1' }, remoteAddress: '8.8.8.8' });
    const a2 = await app.inject({ method: 'GET', url: '/test', headers: { 'x-user-id': 'u1' }, remoteAddress: '8.8.8.8' });
    const b1 = await app.inject({ method: 'GET', url: '/test', headers: { 'x-user-id': 'u2' }, remoteAddress: '8.8.8.8' });
    expect(a1.statusCode).toBe(200);
    expect(a2.statusCode).toBe(429);
    expect(b1.statusCode).toBe(200);
  });
});
