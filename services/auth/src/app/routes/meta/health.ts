import type { FastifyInstance } from 'fastify';
import type { Config } from '../../../config';
import type { Container } from '../../../container';

export const registerHealthRoute = async (
  app: FastifyInstance,
  _context: { config: Config; container: Container }
) => {
  void _context;
  app.get('/health', async () => ({ status: 'ok' }));
};


