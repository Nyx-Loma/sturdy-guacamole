import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { registerErrorHandler } from '../../app/errorHandler';

describe('directory error handler', () => {
  it('maps validation errors to 400', async () => {
    const app = Fastify();
    registerErrorHandler(app);
    app.get('/bad', async () => {
      const err: any = new Error('invalid');
      err.validation = [{ path: ['field'] }];
      throw err;
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/bad' });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('BAD_REQUEST');
  });

  it('maps 404 errors to NOT_FOUND body', async () => {
    const app = Fastify();
    registerErrorHandler(app);
    app.get('/nf', async (req, reply) => reply.callNotFound());
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/nf' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NOT_FOUND');
  });

  it('maps unhandled errors to 500', async () => {
    const app = Fastify();
    registerErrorHandler(app);
    app.get('/boom', async () => {
      throw new Error('kaboom');
    });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('INTERNAL');
  });
});


