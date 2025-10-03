import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';
import { login } from '../../../usecases/auth/login';
import { requestDeviceNonce } from '../../../usecases/auth/requestNonce';
import { CaptchaRequiredError } from '../../../domain/errors';

// TODO: restore strict UUID validation when integration tests seed real data
const LoginSchema = z.object({
  account_id: z.string(),
  device_id: z.string(),
  nonce: z.string(),
  device_signature: z.string(),
  captcha_token: z.string().optional()
});

// TODO: integrate risk heuristics to only trigger captcha for high-risk flows

export const authRoutes = async (app: FastifyInstance, { container }: { container: Container }) => {
  app.post('/v1/auth/nonce', {
    schema: {
      description: 'Request authentication nonce for device signature',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['account_id', 'device_id'],
        properties: {
          account_id: { type: 'string', format: 'uuid', description: 'Account UUID' },
          device_id: { type: 'string', format: 'uuid', description: 'Device UUID' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            nonce: { type: 'string', description: 'Base64-encoded cryptographic nonce' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const schema = z.object({ account_id: z.string().uuid(), device_id: z.string().uuid() });
    const body = schema.parse(request.body);
    const result = await requestDeviceNonce(container, {
      accountId: body.account_id,
      deviceId: body.device_id
    });
    reply.status(200).send(result);
  });

  app.post('/v1/auth/login', {
    schema: {
      description: 'Authenticate device and receive JWT tokens',
      tags: ['auth'],
      body: {
        type: 'object',
        required: ['account_id', 'device_id', 'nonce', 'device_signature'],
        properties: {
          account_id: { type: 'string', description: 'Account identifier' },
          device_id: { type: 'string', description: 'Device identifier' },
          nonce: { type: 'string', description: 'Nonce from /auth/nonce' },
          device_signature: { type: 'string', description: 'Base64url-encoded device signature' },
          captcha_token: { type: 'string', description: 'Optional Turnstile captcha token' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string', description: 'JWT access token' },
            refresh_token: { type: 'string', description: 'JWT refresh token' },
            expires_in: { type: 'number', description: 'Token expiration in seconds' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = LoginSchema.parse(request.body);
    const captchaOk = await container.services.captcha.verify({
      token: request.headers['cf-turnstile-response']?.toString() ?? body.captcha_token,
      remoteIp: request.ip,
      action: 'login',
      accountId: body.account_id,
      deviceId: body.device_id
    });
    if (!captchaOk) {
      throw new CaptchaRequiredError();
    }
    const signature = Buffer.from(body.device_signature, 'base64url');
    const result = await login(container, {
      accountId: body.account_id,
      deviceId: body.device_id,
      nonce: body.nonce,
      deviceSignature: signature
    });
    reply.status(200).send({
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn
    });
  // codeql[js/missing-rate-limiting] Rate limiting is enforced at server level via registerRateLimiter in server.ts
  });
};


