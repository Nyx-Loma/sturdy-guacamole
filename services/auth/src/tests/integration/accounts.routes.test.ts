import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrap } from '../../app/bootstrap';
import { resetConfigForTests } from '../../config';

describe('accounts routes', () => {
  beforeEach(() => {
    resetConfigForTests();
    process.env.STORAGE_DRIVER = 'memory';
    process.env.CAPTCHA_PROVIDER = 'none';
    delete process.env.POSTGRES_URL;
  });

  it('creates anonymous account', async () => {
    const { server } = await bootstrap();
    const res = await server.app.inject({ method: 'POST', url: '/v1/accounts/anonymous', payload: {} });
    expect(res.statusCode).toBe(201);
    expect(res.json().account_id).toBeDefined();
    await server.close();
  });
});


