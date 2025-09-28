import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { registerRoutes } from './routes';
import { loadConfig } from '../config';
import { createLogger } from '../logging';
import { createContainer } from '../container';

export interface ServerOptions {
  config: import('../config').Config;
  logger: Logger;
  container: import('../container').Container;
}

export interface AuthServer {
  listen(): Promise<FastifyInstance>;
  close(): Promise<void>;
  app: FastifyInstance;
}

export const createServer = async ({ config, logger, container }: ServerOptions): Promise<AuthServer> => {
  const app = Fastify({ logger: { level: logger.level ?? 'info' }, disableRequestLogging: false });
  await registerRoutes(app, { config, container });
  return {
    listen: async () => {
      try {
        await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
      } catch (error) {
        logger.error({ err: error }, 'failed to bind auth server');
        throw error;
      }
      return app;
    },
    close: async () => app.close(),
    app
  };
};

const isDirect = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith('src/app/server.ts') ||
  process.argv[1]?.endsWith('dist/app/server.js')
);

if (isDirect) {
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


