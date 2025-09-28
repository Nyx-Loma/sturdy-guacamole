import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrap } from '../../app/bootstrap';
import { resetConfigForTests } from '../../config';

describe('server error handling', () => {
  beforeEach(() => {
    resetConfigForTests();
    process.env.STORAGE_DRIVER = 'memory';
    process.env.CAPTCHA_PROVIDER = 'none';
    delete process.env.POSTGRES_URL;
  });

  it('returns 404 for unknown route', async () => {
    const { server } = await bootstrap();
    const res = await server.app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(res.statusCode).toBe(404);
    await server.close();
  });

  it('returns 500 for unhandled errors from route handlers', async () => {
    const { server } = await bootstrap();
    server.app.get('/boom', async () => { throw new Error('kaboom'); });
    const res = await server.app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'INTERNAL' });
    await server.close();
  });
});


