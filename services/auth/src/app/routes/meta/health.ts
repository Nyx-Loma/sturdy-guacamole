import type { FastifyInstance } from 'fastify';
import type { Config } from '../../../config';
import type { Container } from '../../../container';

export const registerHealthRoute = async (
  app: FastifyInstance,
  _context: { config: Config; container: Container }
) => {
  void _context;
  app.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok'], description: 'Health status' },
          },
        },
      },
    },
  }, async () => ({ status: 'ok' }));
};


