import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';
import { registerDevice } from '../../../usecases/devices/register';

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
    const body = RegisterSchema.parse(request.body);
    let accountId = body.account_id;
    if (!accountId) {
      const account = await container.services.accounts.createAnonymous();
      accountId = account.id;
    }
    const device = await registerDevice({
      devicesRepo: container.repos.devices,
      limits: container.config,
      accountsRepo: container.repos.accounts
    })({
      accountId,
      publicKey: body.public_key,
      displayName: body.display_name
    });
    reply.status(201).send({ device_id: device.id, account_id: accountId });
  });
};


