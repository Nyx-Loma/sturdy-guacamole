import type { FastifyInstance } from 'fastify';

export const registerErrorHandler = (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'resource not found' });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      reply.status(400).send({ error: 'BAD_REQUEST', message: 'invalid request', details: error.validation });
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    reply.status(500).send({ error: 'INTERNAL', message: 'internal server error' });
  });
};


