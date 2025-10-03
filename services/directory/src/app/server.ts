import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { loadConfig } from '../config/index.js';
import { registerRoutes } from './routes/index.js';
import { createInMemoryDirectoryRepository } from '../repositories/inMemoryRepository.js';
import { createPostgresDirectoryRepository, runMigrations } from '../repositories/postgresRepository.js';
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

  // security headers
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  // rate limiting as early as possible
  registerRateLimiter(app, {
    max: config.RATE_LIMIT_MAX,
    intervalMs: config.RATE_LIMIT_INTERVAL_MS,
    allowList: ['127.0.0.1']
  });

  // request id
  app.addHook('onRequest', async (request) => {
    if (!request.id) {
      const syntheticId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      Object.defineProperty(request, 'id', { value: syntheticId, writable: false, configurable: true });
    }
  });

  // CORS will be registered during start to avoid top-level await

  // Repository/service wiring is completed in start() to allow async init without top-level await
  let wired = false;
  const wireIfNeeded = async () => {
    if (wired) return;
    const repo = config.STORAGE_DRIVER === 'postgres'
      ? (await (async () => { await runMigrations(); return createPostgresDirectoryRepository(); })())
      : createInMemoryDirectoryRepository();
    const service = createDirectoryService(repo);
    app.decorate('directoryService', service);
    wired = true;
  };

  // Ensure wiring even if server is only readied (common in tests)
  // CodeQL: onReady is a lifecycle hook (runs once at startup), not an HTTP route.
  // codeql[js/insufficient-rate-limiting]
  // lgtm[js/insufficient-rate-limiting]
  app.addHook('onReady', async () => {
    await wireIfNeeded();
  });

  // Register Swagger for OpenAPI documentation
  app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Sanctum Directory API',
        description: 'User directory and contact discovery service with privacy-preserving hashed email lookup',
        version: '1.0.0',
        contact: {
          name: 'Sanctum Platform',
        },
      },
      servers: [
        { url: `http://localhost:${config.HTTP_PORT}`, description: 'Local development' },
        { url: 'https://directory.sanctum.app', description: 'Production' },
      ],
      tags: [
        { name: 'directory', description: 'User lookup and discovery' },
        { name: 'health', description: 'Health and status checks' },
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
        },
      },
    },
  });

  // Register Swagger UI
  app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });

  registerMetrics(app);
  registerErrorHandler(app);
  app.register(registerRoutes);

  return {
    app,
    async start() {
      await app.register(fastifyCors, { origin: false });
      await wireIfNeeded();
      await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
      app.log.info(`📚 OpenAPI documentation available at http://${config.HTTP_HOST}:${config.HTTP_PORT}/docs`);
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


