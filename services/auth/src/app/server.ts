import Fastify from 'fastify';
import type { Logger } from 'pino';
import { registerRoutes } from './routes';
import { loadConfig } from '../config';
import { createLogger } from '../logging';
import { createContainer } from '../container';

interface ServerOptions {
  config: import('../config').Config;
  logger: Logger;
  container: unknown;
}

export const createServer = async ({ config, logger, container }: ServerOptions) => {
  const app = Fastify({ logger: { instance: logger }, disableRequestLogging: false });
  await registerRoutes(app, { config, container });
  return {
    listen: async () => {
      await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
      return app;
    },
    close: async () => app.close(),
    app
  };
};

if (import.meta.url === process.argv[1] || process.argv[1]?.endsWith('src/app/server.ts')) {
  (async () => {
    const config = loadConfig();
    const logger = createLogger({ level: config.LOG_LEVEL });
    const container = await createContainer({ config, logger });
    const server = await createServer({ config, logger, container });
    await server.listen();
  })().catch((error) => {
    console.error('Failed to start auth service', error);
    process.exit(1);
  });
}


