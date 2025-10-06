import Fastify from 'fastify';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerMetricsHooks, registerMetricsRoute } from '../../../app/metrics';
import { metricsRegistry } from '../../../observability/metrics';

describe('messaging metrics', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  afterEach(() => {
    metricsRegistry.resetMetrics();
  });

  it('increments counters and observes duration for parameter routes', async () => {
    const app = Fastify({ logger: false });
    app.decorate('config', { NODE_ENV: 'test' } as any);
    registerMetricsHooks(app);
    registerMetricsRoute(app);
    app.get('/users/:id', async () => ({ ok: true }));
    await app.ready();

    const r1 = await app.inject({ method: 'GET', url: '/users/1' });
    const r2 = await app.inject({ method: 'GET', url: '/users/2' });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    const text = metrics.body as string;
    expect(text).toContain('messaging_http_requests_total');
    expect(text).toContain('messaging_http_request_duration_ms');
    // route label will reflect concrete URL when routerPath is not present
    expect(text).toMatch(/route="\/users\/(1|2)"/);
    expect(text).toContain('method="GET"');
    expect(text).toContain('statusCode="200"');

    await app.close();
  });

  it('exposes metrics with correct content type in non-production', async () => {
    const app = Fastify({ logger: false });
    app.decorate('config', { NODE_ENV: 'test' } as any);
    registerMetricsHooks(app);
    registerMetricsRoute(app);
    app.get('/hello', async () => 'ok');
    await app.ready();

    await app.inject({ method: 'GET', url: '/hello' });
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    await app.close();
  });

  it('hides /metrics in production', async () => {
    const app = Fastify({ logger: false });
    app.decorate('config', { NODE_ENV: 'production' } as any);
    registerMetricsHooks(app);
    registerMetricsRoute(app);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('records labels for POST requests', async () => {
    const app = Fastify({ logger: false });
    app.decorate('config', { NODE_ENV: 'test' } as any);
    registerMetricsHooks(app);
    registerMetricsRoute(app);
    app.post('/do', async () => ({ ok: true }));
    await app.ready();

    const r = await app.inject({ method: 'POST', url: '/do', payload: { a: 1 } });
    expect(r.statusCode).toBe(200);

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    const text = metrics.body as string;
    expect(text).toContain('route="/do"');
    expect(text).toContain('method="POST"');
    expect(text).toContain('statusCode="200"');

    await app.close();
  });

  it('tracks multiple requests on the same route', async () => {
    const app = Fastify({ logger: false });
    app.decorate('config', { NODE_ENV: 'test' } as any);
    registerMetricsHooks(app);
    registerMetricsRoute(app);
    app.get('/ping', async () => 'pong');
    await app.ready();

    await app.inject({ method: 'GET', url: '/ping' });
    await app.inject({ method: 'GET', url: '/ping' });
    await app.inject({ method: 'GET', url: '/ping' });

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    const text = metrics.body as string;
    expect(text).toContain('route="/ping"');
    expect(text.match(/messaging_http_requests_total\{[^}]*route="\/ping"[^}]*}/g)).toBeTruthy();

    await app.close();
  });

  it('does not crash if a route does not set routerPath', async () => {
    const app = Fastify({ logger: false });
    app.decorate('config', { NODE_ENV: 'test' } as any);
    registerMetricsHooks(app);
    registerMetricsRoute(app);
    // Fastify will set routerPath for defined routes; this checks basic non-crash behavior
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/not-registered' });
    expect([404, 405]).toContain(res.statusCode);
    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    await app.close();
  });
});


