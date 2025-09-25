import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import type { SocketStream } from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { loadConfig } from '@arqivo/config';
import { WebSocketHub, createInMemoryResumeStore, createRedisResumeStore, createRedisStreamQueue, createQueueConsumer, redactToken } from '@arqivo/transport';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { collectDefaultMetrics } from 'prom-client';
import Redis from 'ioredis';

export async function bootstrapServer() {
  const config = loadConfig();
  const fastify = Fastify({
    logger: {
      level: 'info'
    }
  });

  await fastify.register(websocketPlugin);

  const redis = new Redis(config.REDIS_QUEUE_URL);
  const resumeStore = config.QUEUE_ENABLED
    ? createRedisResumeStore({ redis })
    : createInMemoryResumeStore();
  let queueClose: (() => Promise<void>) | undefined;

  const heartbeatIntervalMs = process.env.NODE_ENV === 'test' ? 1_000 : 60_000;

  const connectionLimiter = new RateLimiterMemory({
    points: config.WS_RATE_LIMIT_CONNECTIONS_PER_MIN,
    duration: 60,
    blockDuration: 60
  });

  const messageLimiter = new RateLimiterMemory({
    points: config.WS_RATE_LIMIT_MESSAGES_PER_MIN,
    duration: 60,
    blockDuration: 60
  });

  const hub = new WebSocketHub({
    heartbeatIntervalMs,
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

  collectDefaultMetrics({ register: hub.getMetricsRegistry(), prefix: 'arqivo_' });

  fastify.get('/metrics', async (_, reply) => {
    reply.header('content-type', 'text/plain');
    return hub.getMetricsRegistry().metrics();
  });

  const queue = createRedisStreamQueue({
    redis,
    streamKey: config.QUEUE_STREAM_KEY,
    consumerGroup: config.QUEUE_GROUP,
    consumerName: config.QUEUE_CONSUMER_NAME
  });

  if (config.QUEUE_ENABLED) {
    await createQueueConsumer({
      hub,
      queue,
      onError: (err) => fastify.log.error({ err }, 'queue consumer error')
    });

    queueClose = async () => {
      if (queue.close) {
        await queue.close();
      }
    };
  }

  fastify.addHook('onClose', async () => {
    fastify.log.info('Server closing');
    if (queueClose) {
      await queueClose();
    }
    await redis.quit();
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

      fastify.log.info({ clientId, resumeToken: redactToken(result.resumeToken) }, 'websocket connected');

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

  const close = async () => {
    await fastify.close();
  };

  const listen = async () => {
    await fastify.listen({
      host: config.SERVER_HOST,
      port: config.SERVER_PORT
    });
  };

  return { fastify, listen, close };
}

