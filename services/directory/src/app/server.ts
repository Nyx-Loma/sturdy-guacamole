import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from '../config/index.js';
import { registerRoutes } from './routes/index.js';
import { createInMemoryDirectoryRepository } from '../repositories/inMemoryRepository.js';
import { createDirectoryService } from '../services/directoryService.js';
import { registerErrorHandler } from './errorHandler';
import { registerMetrics } from './metrics';
import { registerRateLimiter } from './rateLimiter.js';

export interface Server {
  app: FastifyInstance;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const createServer = (): Server => {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL
    }
  });

  const repo = createInMemoryDirectoryRepository();
  const service = createDirectoryService(repo);
  app.decorate('directoryService', service);

  registerRateLimiter(app, {
    max: config.RATE_LIMIT_MAX,
    intervalMs: config.RATE_LIMIT_INTERVAL_MS,
    allowList: ['127.0.0.1']
  });

  registerMetrics(app);
  registerErrorHandler(app);
  app.register(registerRoutes);

  return {
    app,
    async start() {
      await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
    },
    async stop() {
      await app.close();
    }
  };
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const server = createServer();
  server.start().catch((error) => {
    server.app.log.error(error, 'failed to start server');
    process.exitCode = 1;
  });
}


