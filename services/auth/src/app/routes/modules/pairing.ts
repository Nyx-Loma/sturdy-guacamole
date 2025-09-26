import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';
import { initPairing } from '../../../usecases/devices/pairing/initPairing';
import { completePairing } from '../../../usecases/devices/pairing/completePairing';
import { approvePairing } from '../../../usecases/devices/pairing/approvePairing';
import { CaptchaRequiredError } from '../../../domain/errors';

const InitSchema = z.object({
  account_id: z.string().uuid(),
  primary_device_id: z.string().uuid(),
  display_name: z.string().optional(),
  captcha_token: z.string().optional()
});

const CompleteSchema = z.object({
  pairing_token: z.string().uuid(),
  new_device_pubkey: z.string()
});

const ApproveSchema = z.object({
  pairing_token: z.string().uuid()
});

export const pairingRoutes = async (app: FastifyInstance, { container }: { container: Container }) => {
  app.post('/v1/devices/pair/init', async (request, reply) => {
    const body = InitSchema.parse(request.body);
    const captchaOk = await container.services.captcha.verify({
      token: request.headers['cf-turnstile-response']?.toString() ?? body.captcha_token,
      remoteIp: request.ip,
      action: 'pair_init',
      accountId: body.account_id,
      deviceId: body.primary_device_id
    });
    if (!captchaOk) {
      throw new CaptchaRequiredError();
    }
    const token = await initPairing(container, {
      accountId: body.account_id,
      primaryDeviceId: body.primary_device_id,
      displayName: body.display_name
    });
    reply.status(201).send({
      pairing_token: token.token,
      nonce: token.nonce,
      ttl_seconds: container.config.PAIRING_TOKEN_TTL_SECONDS
    });
  });

  app.post('/v1/devices/pair/complete', async (request, reply) => {
    const body = CompleteSchema.parse(request.body);
    const token = await completePairing(container, {
      pairingToken: body.pairing_token,
      newPublicKey: body.new_device_pubkey
    });
    reply.status(202).send({
      nonce: token.nonce,
      account_id: token.accountId,
      primary_device_id: token.primaryDeviceId
    });
  });

  app.post('/v1/devices/pair/approve', async (request, reply) => {
    const body = ApproveSchema.parse(request.body);
    const token = await approvePairing(container, { pairingToken: body.pairing_token });
    reply.status(200).send({
      pairing_token: token.token,
      pending_public_key: token.pendingPublicKey,
      device_display_name: token.pendingDisplayName
    });
  });
};


