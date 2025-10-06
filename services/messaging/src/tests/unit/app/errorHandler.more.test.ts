import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandler } from '../../../app/errorHandler';
import { ZodError } from 'zod';

describe('error handler (more)', () => {
  it('maps ZodError to 400 VALIDATION_ERROR', async () => {
    const app = Fastify();
    registerErrorHandler(app);
    app.get('/boom', async () => { throw new ZodError([]); });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});


