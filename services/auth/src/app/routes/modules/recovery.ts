import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';
import { NotFoundError } from '../../../domain/errors';

const SetupSchema = z.object({
  account_id: z.string().uuid(),
  recovery_code: z.string().min(8)
});

export const recoveryRoutes = async (app: FastifyInstance, _context: { container: Container }) => {
  app.post('/v1/recovery/setup', async (_request, reply) => {
    reply.status(501).send({ error: 'NOT_IMPLEMENTED', message: 'recovery setup pending' });
  });
};


