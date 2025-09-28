import type { FastifyInstance } from 'fastify';
import { registerDirectoryRoutes } from './modules/directory.js';
import { registerHealthRoutes } from './modules/health.js';

export const registerRoutes = async (app: FastifyInstance) => {
  await app.register(registerHealthRoutes, { prefix: '/v1/directory' });
  await app.register(registerDirectoryRoutes, { prefix: '/v1/directory' });
};


