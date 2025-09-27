import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';

const RegisterSchema = z.object({
  account_id: z.string().uuid().optional(),
  public_key: z.string(),
  display_name: z.string().optional()
});

export const devicesRoutes = async (
  app: FastifyInstance,
  { container }: { container: Container }
) => {
  app.post('/v1/devices/register', async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'validation_error', issues: parsed.error.issues });
    }
    const body = parsed.data;
    let accountId = body.account_id;
    if (!accountId) {
      const account = await container.services.accounts.createAnonymous();
      accountId = account.id;
    }
    try {
      const device = await container.services.devices.register(accountId, body.public_key, body.display_name);
      reply.status(201).send({ device_id: device.id, account_id: accountId });
    } catch (error) {
      if (error instanceof Error && error.name === 'RateLimitError') {
        return reply.status(429).send({ error: 'RATE_LIMIT', message: error.message });
      }
      return reply.status(503).send({ error: 'DEVICE_REGISTRATION_FAILED' });
    }
  });
};


