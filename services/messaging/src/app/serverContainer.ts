import { Pool } from 'pg';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MessagingConfig } from '../config';
import { createStorageClient, createConsoleStorageLogger } from '@sanctum/storage';
import { PostgresRecordAdapter } from '@sanctum/storage/adapters/postgres';
import { RedisStreamAdapter } from '@sanctum/storage/adapters/redisStream';
import { createMessageService } from '../usecases/messages/messageService';
import { createConversationService } from '../usecases/conversations/conversationService';
import { createOutboxRepository } from '../repositories/outboxRepository';
import { createDispatcher, type Dispatcher } from './stream/dispatcher';
import { createConsumer, type Consumer } from './stream/consumer';
import { createParticipantCache, type ParticipantCache } from './stream/participantCache';

export interface MessagingContainer {
  init(): Promise<void>;
  pgPool: Pool;
  redis: Redis;
  storage: ReturnType<typeof createStorageClient>;
  participantCache?: ParticipantCache;
  dispatcher?: Dispatcher;
  consumer?: Consumer;
}

export const createMessagingContainer = async (
  app: FastifyInstance,
  config: MessagingConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hub?: any // WebSocketHub type from @sanctum/transport
): Promise<MessagingContainer> => {
  // Create shared clients with instrumentation
  const pgPool = new Pool({
    connectionString: config.POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:5432/messaging',
    application_name: 'messaging-service',
    max: config.POSTGRES_POOL_MAX,
    min: config.POSTGRES_POOL_MIN,
    idleTimeoutMillis: 30000,           // 30s idle timeout
    connectionTimeoutMillis: 2000,       // 2s acquisition timeout (fail fast)
  });

  // Instrument pool metrics
  const { messagingMetrics } = await import('../observability/metrics');
  
  // Track pool state every 10s
  const poolMetricsInterval = setInterval(() => {
    messagingMetrics.poolTotalCount.set(pgPool.totalCount);
    messagingMetrics.poolIdleCount.set(pgPool.idleCount);
    messagingMetrics.poolWaitingCount.set(pgPool.waitingCount);
  }, 10000);

  // Track acquisition timing
  const originalConnect = pgPool.connect.bind(pgPool);
  pgPool.connect = async function(...args: Parameters<typeof originalConnect>) {
    const startAcquire = Date.now();
    try {
      const client = await originalConnect(...args);
      const waitMs = Date.now() - startAcquire;
      messagingMetrics.poolAcquireWaitMs.observe(waitMs);
      return client;
    } catch (err) {
      const error = err as Error;
      if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        messagingMetrics.poolAcquireTimeouts.inc();
        messagingMetrics.poolConnectErrors.labels({ error_type: 'timeout' }).inc();
      } else {
        messagingMetrics.poolConnectErrors.labels({ error_type: 'other' }).inc();
      }
      throw err;
    }
  };

  // Cleanup interval on shutdown
  app.addHook('onClose', async () => {
    clearInterval(poolMetricsInterval);
  });

  const redis = new Redis(config.REDIS_STREAM_URL ?? config.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: false,
  });

  // Create separate Redis client for participant cache pubsub
  const redisSubscriber = new Redis(config.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: false,
  });

  // Create participant cache (Stage 3B/3C)
  const participantCache = createParticipantCache({
    redis,
    subscriberRedis: redisSubscriber,
    logger: app.log,
    ttlSeconds: 300, // 5min fallback TTL
    invalidationChannel: 'conv.participants.inval',
  });

  // Create storage client with shared pool/redis
  const storage = createStorageClient(
    {
      schemaVersion: 1,
      recordAdapters: [
        {
          namespaces: ['messages', 'conversations'],
          adapter: new PostgresRecordAdapter({
            dsn: config.POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:5432/messaging',
            schema: config.POSTGRES_SCHEMA,
            table: config.POSTGRES_TABLE_MESSAGES,
          }),
        },
      ],
      streamAdapters: [
        {
          namespaces: [config.REDIS_STREAM_NAMESPACE],
          adapter: new RedisStreamAdapter({
            redisUrl: config.REDIS_STREAM_URL ?? config.REDIS_URL ?? 'redis://localhost:6379',
            streamPrefix: config.REDIS_STREAM_PREFIX,
            groupPrefix: config.REDIS_STREAM_GROUP_PREFIX,
            consumerName: config.REDIS_CONSUMER_NAME,
            readCount: config.REDIS_STREAM_BATCH_SIZE,
            blockTimeoutMs: config.REDIS_STREAM_BLOCK_MS,
          }),
        },
      ],
    },
    {
      logger: createConsoleStorageLogger(),
    }
  );

  // Create outbox repository and dispatcher (if enabled)
  let dispatcher: Dispatcher | undefined;
  if (config.DISPATCHER_ENABLED) {
    const outbox = createOutboxRepository(pgPool);
    dispatcher = createDispatcher({
      outbox,
      redis,
      stream: config.DISPATCH_STREAM_NAME,
      maxLenApprox: config.REDIS_STREAM_MAXLEN,
      batchSize: config.DISPATCH_BATCH_SIZE,
      maxAttempts: config.DISPATCH_MAX_ATTEMPTS,
      logger: app.log,
    });
  }

  // Create consumer (if enabled and hub provided)
  let consumer: Consumer | undefined;
  if (config.CONSUMER_ENABLED && hub) {
    consumer = createConsumer({
      redis,
      pgPool,
      hub,
      stream: config.DISPATCH_STREAM_NAME,
      group: config.CONSUMER_GROUP_NAME,
      consumerName: config.CONSUMER_NAME,
      batchSize: config.CONSUMER_BATCH_SIZE,
      blockMs: config.CONSUMER_BLOCK_MS,
      pelHygieneIntervalMs: 30000, // 30s
      logger: app.log,
    });
  }

  // Defer service creation until after ports are decorated in init()

  const init = async () => {
    await redis.connect();
    await redisSubscriber.connect();
    await participantCache.start();
    
    app.decorate('pgPool', pgPool);
    app.decorate('redis', redis);
    app.decorate('storage', storage);
    app.decorate('participantCache', participantCache);
    // Ensure minimal ports when storage is off
    if (config.MESSAGING_USE_STORAGE === 'off') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memoryMessages = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(app as any).messagesReadPort) {
        app.decorate('messagesReadPort', {
          findById: async (id: string) => memoryMessages.get(id) ?? null,
          listPage: async () => ({ items: [], nextCursor: null }),
          list: async () => Array.from(memoryMessages.values()),
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(app as any).messagesWritePort) {
        app.decorate('messagesWritePort', {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          create: async ({ input, messageId }: any) => {
            const id = messageId ?? randomUUID();
            const now = new Date().toISOString();
            const row = {
              id,
              conversationId: input.conversationId,
              senderId: input.senderId,
              type: input.type,
              status: 'sent',
              encryptedContent: input.encryptedContent,
              contentSize: input.contentSize,
              createdAt: now,
              updatedAt: now,
            };
            memoryMessages.set(id, row);
            return id;
          },
          markAsRead: async () => undefined,
          updateStatus: async () => undefined,
          softDelete: async () => undefined,
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(app as any).conversationsEventsPort) {
        app.decorate('conversationsEventsPort', {
          updateLastMessage: async () => undefined,
          publish: async () => undefined,
        });
      }
    }

    const messageService = createMessageService({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      read: (app as any).messagesReadPort,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      write: (app as any).messagesWritePort,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: (app as any).conversationsEventsPort,
    });

    const conversationService = createConversationService({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      read: (app as any).conversationsReadPort,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      write: (app as any).conversationsWritePort,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events: (app as any).conversationsEventsPort,
    });

    app.decorate('messageService', messageService);
    app.decorate('conversationService', conversationService);
    if (dispatcher) {
      app.decorate('dispatcher', dispatcher);
    }
    if (consumer) {
      app.decorate('consumer', consumer);
    }
    
    // Stop participant cache on shutdown
    // codeql[js/missing-rate-limiting] This is a shutdown hook, not a route handler - rate limiting not applicable
    app.addHook('onClose', async () => {
      await participantCache.stop();
      await redisSubscriber.quit();
    });

    // Minimal dev stubs when storage is off to support /v1/messages routes under k6
    if (config.MESSAGING_USE_STORAGE === 'off') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(app as any).messagesReadPort) {
        app.decorate('messagesReadPort', {
          findById: async () => null,
          listPage: async () => ({ items: [], nextCursor: null }),
          list: async () => []
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(app as any).messageService) {
        app.decorate('messageService', {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          send: async (_cmd: any, _actor: any, options?: { messageId?: string }) => options?.messageId ?? randomUUID(),
          markRead: async () => undefined
        });
      }
    }
  };

  return {
    init,
    pgPool,
    redis,
    storage,
    participantCache,
    dispatcher,
    consumer,
  };
};

declare module 'fastify' {
  interface FastifyInstance {
    pgPool: Pool;
    redis: Redis;
    storage: ReturnType<typeof createStorageClient>;
    participantCache: ParticipantCache;
    dispatcher?: Dispatcher;
    consumer?: Consumer;
  }
  interface FastifyRequest {
    auth?: import('../domain/types/auth.types').AuthContext;
  }
}
