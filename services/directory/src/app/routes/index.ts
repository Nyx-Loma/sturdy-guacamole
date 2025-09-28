import type { FastifyInstance } from 'fastify';
import { registerDirectoryRoutes } from './modules/directory.js';
import { registerHealthRoutes } from './modules/health.js';
import { loadConfig } from '../../config/index.js';

export const registerRoutes = async (app: FastifyInstance) => {
  await app.register(registerHealthRoutes, { prefix: '/v1/directory' });
  app.addHook('onRequest', async (req, reply) => {
    const config = loadConfig();
    if (config.DIRECTORY_REQUIRE_API_KEY) {
      const key = req.headers['x-api-key'];
      if (!key || key !== config.DIRECTORY_API_KEY) {
        return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'invalid api key' });
      }
    }
  });
  await app.register(registerDirectoryRoutes, { prefix: '/v1/directory' });
};


