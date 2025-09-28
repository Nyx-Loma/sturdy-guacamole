import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { registerRateLimiter } from '../../app/rateLimiter';

describe('directory rate limiter', () => {
  it('allows under limit, blocks over limit, and resets after window', async () => {
    const app = Fastify();
    registerRateLimiter(app, { max: 2, intervalMs: 50 });
    app.get('/ping', async () => ({ ok: true }));
    await app.ready();

    const a = await app.inject({ method: 'GET', url: '/ping', remoteAddress: '1.1.1.1' });
    const b = await app.inject({ method: 'GET', url: '/ping', remoteAddress: '1.1.1.1' });
    const c = await app.inject({ method: 'GET', url: '/ping', remoteAddress: '1.1.1.1' });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(c.statusCode).toBe(429);

    await new Promise((r) => setTimeout(r, 60));
    const d = await app.inject({ method: 'GET', url: '/ping', remoteAddress: '1.1.1.1' });
    expect(d.statusCode).toBe(200);
  });

  it('respects allow list', async () => {
    const app = Fastify();
    registerRateLimiter(app, { max: 1, intervalMs: 1000, allowList: ['127.0.0.1'] });
    app.get('/ok', async () => ({ ok: true }));
    await app.ready();
    const r1 = await app.inject({ method: 'GET', url: '/ok', remoteAddress: '127.0.0.1' });
    const r2 = await app.inject({ method: 'GET', url: '/ok', remoteAddress: '127.0.0.1' });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
  });
});


