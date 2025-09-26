import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerErrorHandler } from '../../app/routes/meta/errorHandler';
import {
  AuthError,
  CaptchaRequiredError,
  ExpiredPairingError,
  ExpiredTokenError,
  InvalidSignatureError,
  NotFoundError,
  RateLimitError
} from '../../domain/errors';

const buildApp = () => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  return app;
};

describe('error handler', () => {
  const cases = [
    {
      name: 'RateLimitError',
      make: () => new RateLimitError('too many'),
      status: 429
    },
    {
      name: 'InvalidSignatureError',
      make: () => new InvalidSignatureError('bad sig'),
      status: 401
    },
    {
      name: 'ExpiredPairingError',
      make: () => new ExpiredPairingError('expired'),
      status: 410
    },
    {
      name: 'NotFoundError',
      make: () => new NotFoundError('missing'),
      status: 404
    },
    {
      name: 'CaptchaRequiredError',
      make: () => new CaptchaRequiredError('captcha'),
      status: 429
    },
    {
      name: 'ExpiredTokenError',
      make: () => new ExpiredTokenError('expired token'),
      status: 401
    },
    {
      name: 'custom AuthError',
      make: () =>
        new (class extends AuthError {
          constructor() {
            super('custom', 'CUSTOM');
          }
        })(),
      status: 400
    }
  ] as const;

  it.each(cases)('maps $name to $status', async ({ make, status }) => {
    const error = make();
    const app = buildApp();
    app.get('/throw', () => {
      throw error;
    });
    const response = await app.inject({ method: 'GET', url: '/throw' });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: error.code, message: error.message });
    await app.close();
  });

  it('logs and maps unknown errors to 500', async () => {
    const app = buildApp();
    app.get('/boom', () => {
      throw new Error('unexpected');
    });
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'INTERNAL', message: 'internal_error' });
    await app.close();
  });
});
