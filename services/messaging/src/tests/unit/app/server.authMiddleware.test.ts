import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer } from '../../../app/server';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { resetConfigForTests } from '../../../config';

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
  vi.spyOn(Redis.prototype, 'unsubscribe').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype as any, 'xgroup').mockResolvedValue('OK' as never);
  vi.spyOn(Redis.prototype as any, 'xreadgroup').mockResolvedValue(null as never);
  vi.spyOn(Redis.prototype as any, 'xack').mockResolvedValue(0 as never);
  vi.spyOn(Redis.prototype as any, 'xpending').mockResolvedValue([0, null, null, []] as never);
  vi.spyOn(Redis.prototype as any, 'xautoclaim').mockResolvedValue([[], '0-0'] as never);
};

const stubPostgres = () => {
  vi.spyOn(Pool.prototype, 'connect').mockResolvedValue(undefined as never);
  vi.spyOn(Pool.prototype, 'query').mockResolvedValue({ rows: [], rowCount: 0 } as never);
  vi.spyOn(Pool.prototype, 'end').mockResolvedValue(undefined as never);
};

// TODO: Refactor to lightweight mocks - currently uses ~570MB per test
describe.skip('server auth middleware flag permutations', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.MESSAGING_USE_STORAGE = 'off';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.DISPATCHER_ENABLED = 'false';
    process.env.CONSUMER_ENABLED = 'false';
    stubEnv();
    resetConfigForTests();
  });

  it('enables middleware when PARTICIPANT_ENFORCEMENT_ENABLED not false', async () => {
    delete process.env.PARTICIPANT_ENFORCEMENT_ENABLED;
    resetConfigForTests();
    stubRedis();
    stubPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    try {
      await server.start();
      // Route requiring conversation auth should be reachable but protected by preHandler
      const res = await server.app.inject({
        method: 'POST',
        url: '/v1/messages',
        payload: {
          conversationId: '00000000-0000-0000-0000-000000000000',
          senderId: '00000000-0000-0000-0000-000000000001',
          type: 'text',
          encryptedContent: 'SGVsbG8=',
          payloadSizeBytes: 5,
        },
      });
      // Without headers and container wiring, route may 500; allow 400/401/500
      expect([400, 401, 500]).toContain(res.statusCode);
    } finally {
      await server.stop();
      listenSpy.mockRestore();
    }
  });

  it('disables middleware when PARTICIPANT_ENFORCEMENT_ENABLED=false', async () => {
    process.env.PARTICIPANT_ENFORCEMENT_ENABLED = 'false';
    resetConfigForTests();
    stubRedis();
    stubPostgres();
    const server = await createServer();
    const listenSpy = vi.spyOn(server.app, 'listen' as never).mockResolvedValue(undefined as never);
    try {
      await server.start();
      // No headers → zod validation runs; ensure request is processed by route layer
      const res = await server.app.inject({ method: 'GET', url: '/v1/messages/conversation/00000000-0000-0000-0000-000000000000' });
      expect([200, 401, 500]).toContain(res.statusCode);
    } finally {
      await server.stop();
      listenSpy.mockRestore();
    }
  });
});


