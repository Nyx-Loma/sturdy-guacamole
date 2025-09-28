import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerMetrics } from '../../app/metrics';
import { register } from 'prom-client';

describe('directory metrics', () => {
  beforeEach(() => {
    register.resetMetrics();
  });

  afterEach(() => {
    register.resetMetrics();
  });

  it('increments counters and observes duration', async () => {
    const app = Fastify();
    registerMetrics(app);
    app.get('/hello', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/hello' });
    expect(res.statusCode).toBe(200);

    const metrics = await register.metrics();
    expect(metrics).toContain('directory_requests_total');
    expect(metrics).toContain('directory_request_duration_ms');
  });

  it('hides /metrics in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const app = Fastify();
    registerMetrics(app);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
    process.env.NODE_ENV = prev;
  });
});
