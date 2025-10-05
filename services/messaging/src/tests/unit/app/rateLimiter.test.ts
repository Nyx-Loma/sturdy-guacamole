import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerRateLimiter, type RateLimiterOptions } from '../../../app/rateLimiter';

const okHandler = async () => ({ ok: true });

const createApp = async (options: RateLimiterOptions): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });
  registerRateLimiter(app, options);
  app.get('/health', okHandler);
  app.post('/messages', okHandler);
  await app.ready();
  return app;
};

describe('registerRateLimiter', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('enforces the global limiter when the allow list is empty', async () => {
    app = await createApp({
      global: { max: 2, intervalMs: 60_000 },
    });

    const first = await app.inject({ method: 'GET', url: '/health' });
    const second = await app.inject({ method: 'GET', url: '/health' });
    const third = await app.inject({ method: 'GET', url: '/health' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual(expect.objectContaining({
      code: 'RATE_LIMIT_EXCEEDED',
      details: expect.objectContaining({ scope: 'global' }),
    }));
  });

  it('skips the global limiter for addresses on the allow list', async () => {
    app = await createApp({
      global: { max: 1, intervalMs: 60_000, allowList: ['127.0.0.1'] },
    });

    const first = await app.inject({ method: 'GET', url: '/health' });
    const second = await app.inject({ method: 'GET', url: '/health' });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('applies route-scoped limits using device identifiers', async () => {
    app = await createApp({
      global: { max: 10, intervalMs: 60_000 },
      routes: [
        { method: 'POST', url: '/messages', scope: 'device', max: 1, intervalMs: 60_000 },
      ],
    });

    const first = await app.inject({
      method: 'POST',
      url: '/messages',
      headers: { 'x-device-id': 'device-1' },
      payload: {},
    });
    const second = await app.inject({
      method: 'POST',
      url: '/messages',
      headers: { 'x-device-id': 'device-1' },
      payload: {},
    });
    const third = await app.inject({
      method: 'POST',
      url: '/messages',
      headers: { 'x-device-id': 'device-2' },
      payload: {},
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual(expect.objectContaining({
      details: expect.objectContaining({ key: 'device-1', scope: 'device' }),
    }));
    expect(third.statusCode).toBe(200);
  });

  it('falls back to IP-based keys when scoped headers are missing', async () => {
    app = await createApp({
      global: { max: 10, intervalMs: 60_000 },
      routes: [
        { method: 'POST', url: '/messages', scope: 'session', max: 1, intervalMs: 60_000 },
      ],
    });

    const first = await app.inject({ method: 'POST', url: '/messages', payload: {} });
    const second = await app.inject({ method: 'POST', url: '/messages', payload: {} });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual(expect.objectContaining({
      details: expect.objectContaining({ key: 'session:127.0.0.1', scope: 'session' }),
    }));
  });
});

