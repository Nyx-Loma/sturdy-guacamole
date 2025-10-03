import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { loadConfig } from '../config';
import { registerErrorHandler } from './errorHandler';
import { registerRateLimiter } from './rateLimiter';
import { registerRoutes } from './routes';
import { registerMetricsRoute, registerMetricsHooks } from './metrics';
import { createLogger } from '../observability/logging';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocketHub } from '@sanctum/transport';
import { createMessagingContainer } from './serverContainer';
import { createDispatcherRunner } from './stream/runLoop';

export interface MessagingServer {
  app: FastifyInstance;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export const createServer = async (): Promise<MessagingServer> => {
  const config = loadConfig();
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie']
    },
    disableRequestLogging: false,
    bodyLimit: config.PAYLOAD_MAX_BYTES
  });

  app.decorate('config', config);

  registerSecurityHeaders(app);
  registerMetricsHooks(app);
  await app.register(fastifyWebsocket);
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
  registerErrorHandler(app);
  registerRoutes(app);
  registerMetricsRoute(app);

  const hub = new WebSocketHub({
    heartbeatIntervalMs: config.WEBSOCKET_HEARTBEAT_INTERVAL_MS,
    metricsRegistry: app.metricsRegistry,
    authenticate: async ({ requestHeaders, clientId }) => {
      const deviceIdHeader = requestHeaders['x-device-id'];
      const sessionIdHeader = requestHeaders['x-session-id'];
      const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
      if (!deviceId || !sessionId) {
        throw new Error('missing device or session headers');
      }
      return { accountId: clientId, deviceId };
    },
    loadResumeState: async () => null,
    persistResumeState: async () => undefined,
    dropResumeState: async () => undefined
  });

  const container = await createMessagingContainer(app, config, hub);

  app.get('/ws/metrics', async (_, reply) => {
    reply.header('content-type', 'text/plain');
    const registry = hub.getMetricsRegistry();
    return registry ? registry.metrics() : 'counter 0';
  });

  app.get('/ws', { websocket: true }, (connection, request) => {
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

  const dispatcherRunner = container.dispatcher
    ? createDispatcherRunner(container.dispatcher, config, app.log)
    : null;

  return {
    app,
    async start() {
      if (config.NODE_ENV !== 'production') {
        await app.register(fastifyCors, { origin: false });
      }
      await container.init();
      if (dispatcherRunner) {
        await dispatcherRunner.start();
      }
      if (container.consumer) {
        await container.consumer.start();
      }
      await app.listen({ host: config.HTTP_HOST, port: config.HTTP_PORT });
    },
    async stop() {
      if (container.consumer) {
        await container.consumer.stop();
      }
      if (dispatcherRunner) {
        await dispatcherRunner.stop();
      }
      await app.close();
    }
  };
};

const registerSecurityHeaders = (app: FastifyInstance) => {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (!request.id) {
      Object.defineProperty(request, 'id', {
        value: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        writable: false,
        configurable: true
      });
    }
  });
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  createServer()
    .then((server) => server.start())
    .catch((error) => {
      console.error('Failed to start messaging service', error);
      process.exit(1);
    });
}


