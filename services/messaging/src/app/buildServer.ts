import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { WebSocketHub, createRedisResumeStore } from '@sanctum/transport';
import { loadConfig, type MessagingConfig } from '../config';
import { registerMetricsHooks } from './metrics';
import { registerRateLimiter } from './rateLimiter';
import { registerErrorHandler } from './errorHandler';
import { registerCors } from './plugins/cors';
import { createRequireAuth } from './middleware/auth';
import { registerRoutes } from './routes';
import { createMessagingContainer } from './serverContainer';
import { createDispatcherRunner } from './stream/runLoop';

export interface BuildServerOptions {
  config?: MessagingConfig;
  enableSwagger?: boolean;
}

export const buildServer = async ({ config = loadConfig(), enableSwagger = true }: BuildServerOptions = {}) => {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie']
    },
    disableRequestLogging: false,
    bodyLimit: config.PAYLOAD_MAX_BYTES
  });

  app.decorate('config', config);

  registerMetricsHooks(app);
  await app.register(registerCors, { config });
  await app.register(fastifyWebsocket);
  
  // Apply rate limiting based on mode
  const rateLimitConfig = {
    mode: config.RATE_LIMIT_MODE,
    perDevice: config.RATE_LIMIT_PER_DEVICE,
    perSession: config.RATE_LIMIT_PER_SESSION,
    perUser: config.RATE_LIMIT_PER_USER,
    max: config.RATE_LIMIT_MAX,
    window: config.RATE_LIMIT_INTERVAL_MS,
    burst: config.RATE_LIMIT_BURST
  };

  if (config.RATE_LIMIT_MODE === 'off') {
    app.log.warn({ rateLimitConfig }, 'rate_limiter_disabled');
  } else if (config.RATE_LIMIT_MODE === 'lenient') {
    app.log.info({ rateLimitConfig }, 'rate_limiter_lenient_mode');
    registerRateLimiter(app, {
      global: {
        max: 1000000,
        intervalMs: config.RATE_LIMIT_INTERVAL_MS,
        allowList: ['127.0.0.1', '::1']
      },
      routes: [
        {
          method: 'POST',
          url: '/v1/messages',
          scope: 'device',
          max: 1000000,
          intervalMs: config.RATE_LIMIT_INTERVAL_MS
        },
        {
          method: 'POST',
          url: '/v1/messages',
          scope: 'session',
          max: 1000000,
          intervalMs: config.RATE_LIMIT_INTERVAL_MS
        },
        {
          method: 'POST',
          url: '/v1/messages',
          scope: 'user',
          max: 1000000,
          intervalMs: config.RATE_LIMIT_INTERVAL_MS
        }
      ]
    });
  } else {
    app.log.info({ rateLimitConfig }, 'rate_limiter_prod_mode');
    registerRateLimiter(app, {
      global: {
        max: config.RATE_LIMIT_MAX,
        intervalMs: config.RATE_LIMIT_INTERVAL_MS,
        allowList: ['127.0.0.1', '::1']
      },
      routes: [
        {
          method: 'POST',
          url: '/v1/messages',
          scope: 'device',
          max: config.RATE_LIMIT_PER_DEVICE,
          intervalMs: config.RATE_LIMIT_INTERVAL_MS
        },
        {
          method: 'POST',
          url: '/v1/messages',
          scope: 'session',
          max: config.RATE_LIMIT_PER_SESSION,
          intervalMs: config.RATE_LIMIT_INTERVAL_MS
        },
        {
          method: 'POST',
          url: '/v1/messages',
          scope: 'user',
          max: config.RATE_LIMIT_PER_USER,
          intervalMs: config.RATE_LIMIT_INTERVAL_MS
        }
      ]
    });
  }
  
  registerErrorHandler(app);

  const requireAuth = createRequireAuth({ config });
  app.addHook('preHandler', async (request, reply) => {
    const url = request.url.split('?')[0]; // Strip query params
    if (request.method === 'OPTIONS' || url === '/health' || url === '/ready' || url.startsWith('/metrics')) {
      return;
    }
    await requireAuth(request, reply);
  });

  await registerRoutes(app);
  app.get('/health', async () => ({ status: 'ok' }));

  if (enableSwagger) {
    await app.register(fastifySwagger, {
      openapi: {
        openapi: '3.1.0',
        info: {
          title: 'Sanctum Messaging API',
          description: 'End-to-end encrypted messaging service with realtime delivery and conversation management',
          version: '1.0.0'
        }
      }
    });
    await app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true
      },
      staticCSP: true
    });
  }

  return app;
};

export const createMessagingServer = async ({ config = loadConfig(), enableSwagger = true }: BuildServerOptions = {}) => {
  const app = await buildServer({ config, enableSwagger });

  let resumeStoreLoad = async () => null;
  let resumeStorePersist = async () => undefined;
  let resumeStoreDrop = async () => undefined;

  const hub = new WebSocketHub({
    heartbeatIntervalMs: config.WEBSOCKET_HEARTBEAT_INTERVAL_MS,
    metricsRegistry: app.metricsRegistry,
    authenticate: async ({ requestHeaders }) => {
      const authHeader = requestHeaders.authorization;
      if (!authHeader || Array.isArray(authHeader)) {
        throw new Error('missing authorization header');
      }

      const fakeRequest = {
        headers: { authorization: authHeader },
        context: {},
        routerPath: '/ws',
        method: 'GET',
        id: `ws-${Date.now()}`
      } as unknown as FastifyRequest;

      const fakeReply = {
        code: () => ({ send: () => undefined })
      } as unknown as FastifyReply;

      const requireAuth = createRequireAuth({ config });
      await requireAuth(fakeRequest, fakeReply);

      const auth = (fakeRequest as { auth?: import('./middleware/auth').AuthContext }).auth;
      if (!auth) {
        throw new Error('authentication failed');
      }

      return { accountId: auth.userId, deviceId: auth.deviceId };
    },
    loadResumeState: async () => resumeStoreLoad(),
    persistResumeState: async (snapshot) => resumeStorePersist(snapshot),
    dropResumeState: async (token) => resumeStoreDrop(token)
  });

  const container = await createMessagingContainer(app, config, hub);
  const resumeStore = createRedisResumeStore({
    redis: container.redis,
    keyPrefix: `${config.REDIS_STREAM_PREFIX}:resume:`,
    ttlSeconds: 900,
  });

  resumeStoreLoad = resumeStore.load;
  resumeStorePersist = resumeStore.persist;
  resumeStoreDrop = resumeStore.drop;

  const dispatcherRunner = container.dispatcher
    ? createDispatcherRunner(container.dispatcher, config, app.log)
    : null;

  app.get('/ws/metrics', async (_, reply) => {
    reply.header('content-type', 'text/plain');
    const registry = hub.getMetricsRegistry();
    return registry ? registry.metrics() : 'counter 0';
  });

  app.get('/ws', { websocket: true }, (connection, request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = 'socket' in connection ? connection.socket : (connection as any);
    const clientId = request.id.toString();
    void hub
      .register(socket, clientId, request.headers)
      .then(() => {
        socket.on('message', (raw) => {
          void hub.handleMessage(clientId, raw);
        });
      })
      .catch((err) => {
        app.log.error({ err, clientId }, 'websocket register failed');
        socket.close(1011, 'registration_failed');
      });
  });

  return { app, container, dispatcherRunner };
};
