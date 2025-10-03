import type { FastifyInstance } from 'fastify';

export const registerHealthRoutes = async (app: FastifyInstance) => {
  app.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'], description: 'Health status' },
            service: { type: 'string', enum: ['directory'], description: 'Service name' },
          },
        },
      },
    },
  }, async () => ({ status: 'ok', service: 'directory' }));
};


