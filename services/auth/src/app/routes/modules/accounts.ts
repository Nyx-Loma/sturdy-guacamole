import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';

const CreateAnonymousSchema = z.object({});

export const accountsRoutes = async (
  app: FastifyInstance,
  { container }: { container: Container }
) => {
  app.post('/v1/accounts/anonymous', async (request, reply) => {
    CreateAnonymousSchema.parse(request.body ?? {});
    const account = await container.services.accounts.createAnonymous();
    reply.status(201).send({ account_id: account.id });
  });
};


