import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrap } from '../../app/bootstrap';
import { resetConfigForTests } from '../../config';

describe('health endpoint', () => {
  beforeEach(() => {
    resetConfigForTests();
    process.env.STORAGE_DRIVER = 'memory';
    process.env.CAPTCHA_PROVIDER = 'none';
    delete process.env.POSTGRES_URL;
  });
  it('returns ok', async () => {
    const { server } = await bootstrap();
    const response = await server.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });
});


