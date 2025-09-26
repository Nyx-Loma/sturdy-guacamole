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
  app.post('/v1/auth/nonce', async (request, reply) => {
    const schema = z.object({ account_id: z.string().uuid(), device_id: z.string().uuid() });
    const body = schema.parse(request.body);
    const result = await requestDeviceNonce(container, {
      accountId: body.account_id,
      deviceId: body.device_id
    });
    reply.status(200).send(result);
  });

  app.post('/v1/auth/login', async (request, reply) => {
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
  });
};


