import { describe, expect, it } from 'vitest';
import { bootstrap } from '../../app/bootstrap';

describe('health endpoint', () => {
  it('returns ok', async () => {
    const { server } = await bootstrap();
    const response = await server.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    await server.close();
  });
});


