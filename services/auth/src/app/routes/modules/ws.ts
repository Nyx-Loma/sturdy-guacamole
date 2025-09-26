import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../../container';

const AttachNonceSchema = z.object({
  account_id: z.string().uuid(),
  device_id: z.string().uuid()
});

export const wsRoutes = async (app: FastifyInstance, { container }: { container: Container }) => {
  app.post('/v1/ws/nonce', async (request, reply) => {
    const body = AttachNonceSchema.parse(request.body);
    const nonce = await container.services.deviceAssertion.generateNonce(body.device_id);
    reply.status(200).send({ nonce, device_id: body.device_id });
  });
};

