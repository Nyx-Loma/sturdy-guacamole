import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from '../../app/server';
import { resetConfigForTests } from '../../config';

describe('directory security headers and api key', () => {
  let server: Server;

  beforeAll(async () => {
    process.env.DIRECTORY_REQUIRE_API_KEY = 'true';
    process.env.DIRECTORY_API_KEY = 'test-key';
    resetConfigForTests();
    server = createServer();
    await server.app.ready();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('returns security headers', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/v1/directory/health', headers: { 'x-api-key': 'test-key' } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
  });

  it('enforces API key when required', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/v1/directory/accounts/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(401);
    const ok = await server.app.inject({ method: 'GET', url: '/v1/directory/health', headers: { 'x-api-key': 'test-key' } });
    expect(ok.statusCode).toBe(200);
  });
});


