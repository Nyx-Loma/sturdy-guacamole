import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Redis from 'ioredis';
import { Pool } from 'pg';

let createServer: typeof import('../../../app/server').createServer;
let resetConfigForTests: typeof import('../../../config').resetConfigForTests;

const stubEnv = () => {
  process.env.NODE_ENV = 'test';
  process.env.DISPATCHER_ENABLED = 'false';
  process.env.CONSUMER_ENABLED = 'false';
  process.env.MESSAGING_USE_STORAGE = 'off';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAMOCKx2qCk41sJLdnOjFkMrDXLI4YAln\n4jKAmhpX6wX+ZspGDZsBoBPXaAgNsq4CPGK/c/pX9nuSUXGMWzMEuziUCAwEAAQ==\n-----END PUBLIC KEY-----';
  delete process.env.JWT_JWKS_URL;
  process.env.JWT_ISSUER = 'test-issuer';
  process.env.JWT_AUDIENCE = 'test-audience';
  process.env.JWT_ALGS = 'RS256';
  process.env.JWT_CLOCK_SKEW = '60';
};

const clearEnv = () => {
  delete process.env.JWT_PUBLIC_KEY;
  delete process.env.JWT_JWKS_URL;
  delete process.env.JWT_ISSUER;
  delete process.env.JWT_AUDIENCE;
  delete process.env.JWT_ALGS;
  delete process.env.JWT_CLOCK_SKEW;
};

const stubRedis = () => {
  vi.spyOn(Redis.prototype, 'connect').mockResolvedValue(undefined as never);
  vi.spyOn(Redis.prototype, 'subscribe').mockResolvedValue(1 as never);
  vi.spyOn(Redis.prototype as any, 'on').mockReturnValue(Redis.prototype as any);
  vi.spyOn(Redis.prototype, 'quit').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype, 'unsubscribe').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype as any, 'xgroup').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype as any, 'xreadgroup').mockResolvedValue(null as never);
};

const stubPostgres = () => {
  vi.spyOn(Pool.prototype, 'connect').mockResolvedValue(undefined as never);
  vi.spyOn(Pool.prototype, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
  vi.spyOn(Pool.prototype, 'end').mockResolvedValue(undefined as never);
};

const loadModules = async () => {
  vi.resetModules();
  ({ createServer } = await import('../../../app/server'));
  ({ resetConfigForTests } = await import('../../../config'));
};

// TODO: Refactor to lightweight mocks - currently uses ~570MB per test
describe.skip('server bootstrap', () => {
  beforeEach(async () => {
    stubEnv();
    await loadModules();
    resetConfigForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearEnv();
  });

  it('starts and registers routes, docs, and metrics in test env', async () => {
    stubRedis();
    stubPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    try {
      await server.start();
      const res = await server.app.inject({ method: 'GET', url: '/health' });
      expect([200, 401]).toContain(res.statusCode);
      expect(server.app.printRoutes()).toContain('docs');
      expect(server.app.printRoutes()).toContain('metrics');
    } finally {
      await server.stop();
      listenSpy.mockRestore();
    }
  });
});


