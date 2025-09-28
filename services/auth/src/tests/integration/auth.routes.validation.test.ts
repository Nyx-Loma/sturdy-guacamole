import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrap } from '../../app/bootstrap';
import { resetConfigForTests } from '../../config';

describe('auth routes validation', () => {
  beforeEach(() => {
    resetConfigForTests();
    process.env.STORAGE_DRIVER = 'memory';
    process.env.CAPTCHA_PROVIDER = 'none';
  });

  it('returns 500 on invalid nonce payload (generic handler)', async () => {
    const { server } = await bootstrap();
    const res = await server.app.inject({ method: 'POST', url: '/v1/auth/nonce', payload: { account_id: 'not-a-uuid', device_id: 'also-bad' } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'INTERNAL' });
    await server.close();
  });
});
