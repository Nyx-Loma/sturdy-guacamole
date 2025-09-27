import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import type { SocketStream } from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { Config } from '@sanctum/config';
import { WebSocketHub, createInMemoryResumeStore, createRedisResumeStore, createRedisStreamQueue, createQueueConsumer, redactToken } from '@sanctum/transport';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { collectDefaultMetrics } from 'prom-client';
import Redis from 'ioredis';

interface BootstrapDeps {
  fastifyFactory?: typeof Fastify;
  websocketPlugin?: typeof websocketPlugin;
  redisFactory?: (url: string) => Redis;
  hubFactory?: (options: ConstructorParameters<typeof WebSocketHub>[0]) => WebSocketHub;
  createInMemoryResumeStore?: typeof createInMemoryResumeStore;
  createRedisResumeStore?: typeof createRedisResumeStore;
  createRedisStreamQueue?: typeof createRedisStreamQueue;
  createQueueConsumer?: typeof createQueueConsumer;
  collectDefaultMetrics?: typeof collectDefaultMetrics;
  RateLimiterMemory?: typeof RateLimiterMemory;
  redactToken?: typeof redactToken;
  onAfterClose?: () => void;
}

export interface BootstrapResult {
  fastify: FastifyInstance;
  listen: () => Promise<void>;
  close: () => Promise<void>;
}

export const createServer = async (config: Config, deps: BootstrapDeps = {}): Promise<BootstrapResult> => {
  const {
    fastifyFactory = Fastify,
    websocketPlugin: wsPlugin = websocketPlugin,
    redisFactory = (url: string) => new Redis(url),
    hubFactory = (options: ConstructorParameters<typeof WebSocketHub>[0]) => new WebSocketHub(options),
    createInMemoryResumeStore: memoryResume = createInMemoryResumeStore,
    createRedisResumeStore: redisResume = createRedisResumeStore,
    createRedisStreamQueue: redisQueue = createRedisStreamQueue,
    createQueueConsumer: queueConsumer = createQueueConsumer,
    collectDefaultMetrics: collectMetrics = collectDefaultMetrics,
    RateLimiterMemory: Limiter = RateLimiterMemory,
    redactToken: redact = redactToken
  } = deps;

  const fastify = fastifyFactory({
    logger: {
      level: 'info'
    }
  });

  await fastify.register(wsPlugin);

  const redisInstance = redisFactory(config.REDIS_QUEUE_URL);
  const resumeStore = config.QUEUE_ENABLED ? redisResume({ redis: redisInstance }) : memoryResume();

  const connectionLimiter = new Limiter({
    points: config.WS_RATE_LIMIT_CONNECTIONS_PER_MIN,
    duration: 60,
    blockDuration: 60
  });

  const messageLimiter = new Limiter({
    points: config.WS_RATE_LIMIT_MESSAGES_PER_MIN,
    duration: 60,
    blockDuration: 60
  });

  const hub = hubFactory({
    heartbeatIntervalMs: config.WS_HEARTBEAT_INTERVAL_MS,
    logger: fastify.log,
    authenticate: async ({ requestHeaders, clientId }) => {
      const header = requestHeaders.authorization ?? requestHeaders.Authorization;
      const token = Array.isArray(header) ? header[0] : header;
      if (!token || typeof token !== 'string') {
        return null;
      }

      const match = token.match(/^Bearer\s+(.*)$/i);
      const bearer = match ? match[1] : token;
      if (bearer !== process.env.WS_DEV_TOKEN) {
        return null;
      }

      return {
        accountId: 'dev-account',
        deviceId: `dev-device-${clientId}`
      };
    },
    loadResumeState: resumeStore.load,
    persistResumeState: resumeStore.persist,
    dropResumeState: resumeStore.drop,
    metricsRegistry: undefined,
    onMetrics: (event) => {
      fastify.log.debug({ event }, 'ws_metric');
    },
    rateLimiterFactory: () => connectionLimiter,
    messageRateLimiterFactory: () => messageLimiter
  });

  collectMetrics({ register: hub.getMetricsRegistry(), prefix: 'arqivo_' });

  fastify.get('/metrics', async (_, reply) => {
    reply.header('content-type', 'text/plain');
    return hub.getMetricsRegistry().metrics();
  });

  const queue = redisQueue({
    redis: redisInstance,
    streamKey: config.QUEUE_STREAM_KEY,
    consumerGroup: config.QUEUE_GROUP,
    consumerName: config.QUEUE_CONSUMER_NAME
  });

  let queueClose: (() => Promise<void>) | undefined;

  if (config.QUEUE_ENABLED) {
    await queueConsumer({
      hub,
      queue,
      onError: (err) => fastify.log.error({ err }, 'queue consumer error')
    });
    queueClose = queue.close;
  }

  fastify.addHook('onClose', async () => {
    fastify.log.info('Server closing');
    if (queueClose) {
      await queueClose();
    }
    await redisInstance.quit();
    deps.onAfterClose?.();
  });

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/ws', { websocket: true }, (connection: SocketStream, request: FastifyRequest) => {
    const clientId = request.id.toString();
    const socket: WebSocket = 'socket' in connection ? (connection.socket as WebSocket) : (connection as unknown as WebSocket);

    void (async () => {
      const result = await hub.register(socket, clientId, request.headers);
      if (!result) {
        fastify.log.warn({ clientId }, 'websocket unauthorized');
        return;
      }

      fastify.log.info({ clientId, resumeToken: redact(result.resumeToken) }, 'websocket connected');

      socket.send(
        JSON.stringify({
          type: 'connection_ack',
          resumeToken: result.resumeToken
        })
      );

      socket.on('message', (raw) => {
        void hub.handleMessage(clientId, raw);
      });

      socket.on('close', (code, reason) => {
        fastify.log.info({ clientId, code, reason: reason.toString() }, 'websocket closed');
      });
    })().catch((error) => {
      fastify.log.error({ clientId, err: { name: (error as Error)?.name, message: (error as Error)?.message } }, 'websocket register failed');
      socket.close(1011, 'internal_error');
    });
  });

  const listen = async () => {
    await fastify.listen({
      host: config.SERVER_HOST,
      port: config.SERVER_PORT
    });
  };

  const close = async () => {
    await fastify.close();
  };

  return { fastify, listen, close };
};

