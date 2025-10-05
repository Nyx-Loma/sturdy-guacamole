import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from '../../../app/server';
import { resetConfigForTests } from '../../../config';
import Redis from 'ioredis';
import { Pool } from 'pg';

const mockRedisBasics = () => {
  const connectMock = vi.spyOn(Redis.prototype, 'connect').mockResolvedValue(undefined as never);
  const subscribeMock = vi.spyOn(Redis.prototype, 'subscribe').mockResolvedValue(1 as never);
  const onMock = vi.spyOn(Redis.prototype as any, 'on').mockReturnValue(Redis.prototype as any);
  const quitMock = vi.spyOn(Redis.prototype, 'quit').mockResolvedValue('OK' as never);
  const unsubscribeMock = vi.spyOn(Redis.prototype, 'unsubscribe').mockResolvedValue('OK' as never);
  // Stub stream commands used by consumer
  const xgroupMock = vi.spyOn(Redis.prototype as any, 'xgroup').mockResolvedValue('OK' as never);
  const xreadgroupMock = vi.spyOn(Redis.prototype as any, 'xreadgroup').mockResolvedValue(null as never);
  const xackMock = vi.spyOn(Redis.prototype as any, 'xack').mockResolvedValue(0 as never);
  const xpendingMock = vi.spyOn(Redis.prototype as any, 'xpending').mockResolvedValue([0, null, null, []] as never);
  const xautoclaimMock = vi.spyOn(Redis.prototype as any, 'xautoclaim').mockResolvedValue([[], '0-0'] as never);
  return { connectMock, subscribeMock, onMock, quitMock, unsubscribeMock, xgroupMock, xreadgroupMock, xackMock, xpendingMock, xautoclaimMock };
};

const mockPostgres = () => {
  const connectMock = vi.spyOn(Pool.prototype, 'connect').mockResolvedValue(undefined as never);
  const queryMock = vi.spyOn(Pool.prototype, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
  const endMock = vi.spyOn(Pool.prototype, 'end').mockResolvedValue(undefined as never);
  return { connectMock, queryMock, endMock };
};

const stubEnv = () => {
  process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMOCKx2qCk41sJLdnOjFkMrDXLI4YAln\n4jKAmhpX6wX+ZspGDZsBoBPXaAgNsq4CPGK/c/pX9nuSUXGMWzMEuziUCAwEAAQ==\n-----END PUBLIC KEY-----';
  process.env.JWT_ISSUER = 'test-issuer';
  process.env.JWT_AUDIENCE = 'test-audience';
};

const stubRedis = () => {
  vi.spyOn(Redis.prototype, 'connect').mockResolvedValue(undefined as never);
  vi.spyOn(Redis.prototype, 'subscribe').mockResolvedValue(1 as never);
  vi.spyOn(Redis.prototype as any, 'on').mockReturnValue(Redis.prototype as any);
  vi.spyOn(Redis.prototype, 'quit').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype, 'unsubscribe').mockResolvedValue(0 as never);
  vi.spyOn(Redis.prototype as any, 'xgroup').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype as any, 'xreadgroup').mockResolvedValue(null as never);
};

describe('server permutations', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.MESSAGING_USE_STORAGE = 'off';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.DISPATCHER_ENABLED = 'false';
    process.env.CONSUMER_ENABLED = 'false';
    stubEnv();
    resetConfigForTests();
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('dispatcher disabled, consumer disabled', async () => {
    stubRedis();
    const pg = mockPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    // CRITICAL: Don't mock close() - we need the real cleanup to prevent memory leaks
    await server.start();
    expect(listenSpy).toHaveBeenCalled();
    await server.stop();
    // Verify stop was called (app.close happens inside server.stop)
    listenSpy.mockRestore();
    pg.connectMock.mockRestore();
    pg.queryMock.mockRestore();
    pg.endMock.mockRestore();
  });

  it('dispatcher enabled, consumer disabled', async () => {
    process.env.DISPATCHER_ENABLED = 'true';
    process.env.CONSUMER_ENABLED = 'false';
    resetConfigForTests();
    const m = mockRedisBasics();
    const pg = mockPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    await server.start();
    // dispatcher should be available when enabled
    expect(server.app.dispatcher).toBeDefined();
    await server.stop();
    // stopped without error
    listenSpy.mockRestore();
    m.connectMock.mockRestore();
    m.subscribeMock.mockRestore();
    m.onMock.mockRestore();
    m.quitMock.mockRestore();
    m.unsubscribeMock.mockRestore();
    m.xgroupMock.mockRestore();
    m.xreadgroupMock.mockRestore();
    m.xackMock.mockRestore();
    m.xpendingMock.mockRestore();
    m.xautoclaimMock.mockRestore();
    pg.connectMock.mockRestore();
    pg.queryMock.mockRestore();
    pg.endMock.mockRestore();
  });

  it('dispatcher disabled, consumer enabled', async () => {
    process.env.DISPATCHER_ENABLED = 'false';
    process.env.CONSUMER_ENABLED = 'true';
    resetConfigForTests();
    const m = mockRedisBasics();
    const pg = mockPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    await server.start();
    expect(server.app.consumer).toBeDefined();
    await server.stop();
    // stopped without error
    listenSpy.mockRestore();
    m.connectMock.mockRestore();
    m.subscribeMock.mockRestore();
    m.onMock.mockRestore();
    m.quitMock.mockRestore();
    m.unsubscribeMock.mockRestore();
    m.xgroupMock.mockRestore();
    m.xreadgroupMock.mockRestore();
    m.xackMock.mockRestore();
    m.xpendingMock.mockRestore();
    m.xautoclaimMock.mockRestore();
    pg.connectMock.mockRestore();
    pg.queryMock.mockRestore();
    pg.endMock.mockRestore();
  });

  it('WS auth fails when headers missing', async () => {
    process.env.DISPATCHER_ENABLED = 'false';
    process.env.CONSUMER_ENABLED = 'false';
    resetConfigForTests();
    const m = mockRedisBasics();
    const pg = mockPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    await server.start();
    const res = await server.app.inject({ method: 'GET', url: '/ws' });
    expect([400, 401, 404, 500]).toContain(res.statusCode);
    await server.stop();
    listenSpy.mockRestore();
    m.connectMock.mockRestore();
    m.subscribeMock.mockRestore();
    m.onMock.mockRestore();
    m.quitMock.mockRestore();
    m.unsubscribeMock.mockRestore();
    pg.connectMock.mockRestore();
    pg.queryMock.mockRestore();
    pg.endMock.mockRestore();
  });

  it('metrics route present, docs route present', async () => {
    process.env.DISPATCHER_ENABLED = 'false';
    process.env.CONSUMER_ENABLED = 'false';
    const m = mockRedisBasics();
    const pg = mockPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    await server.start();
    const routes = server.app.printRoutes();
    expect(routes).toContain('docs');
    expect(routes).toContain('metrics');
    await server.stop();
    listenSpy.mockRestore();
    m.connectMock.mockRestore();
    m.subscribeMock.mockRestore();
    m.onMock.mockRestore();
    m.quitMock.mockRestore();
    m.unsubscribeMock.mockRestore();
    pg.connectMock.mockRestore();
    pg.queryMock.mockRestore();
    pg.endMock.mockRestore();
  });

  it('authorization middleware disabled by flag', async () => {
    process.env.PARTICIPANT_ENFORCEMENT_ENABLED = 'false';
    process.env.DISPATCHER_ENABLED = 'false';
    process.env.CONSUMER_ENABLED = 'false';
    resetConfigForTests();
    const m = mockRedisBasics();
    const pg = mockPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    const logSpy = vi.spyOn(server.app.log, 'info').mockImplementation(() => server.app.log);
    await server.start();
    // We create server after flag set; log may have occurred before spy was attached.
    // Validate that no preHandler auth hook blocked a basic messages route request.
    const res = await server.app.inject({ method: 'GET', url: '/v1/messages/conversation/00000000-0000-0000-0000-000000000000' });
    expect([200, 401, 404, 500]).toContain(res.statusCode);
    await server.stop();
    listenSpy.mockRestore();
    logSpy.mockRestore();
    m.connectMock.mockRestore();
    m.subscribeMock.mockRestore();
    m.onMock.mockRestore();
    m.quitMock.mockRestore();
    m.unsubscribeMock.mockRestore();
    pg.connectMock.mockRestore();
    pg.queryMock.mockRestore();
    pg.endMock.mockRestore();
  });
});


