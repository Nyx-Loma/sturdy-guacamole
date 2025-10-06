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
import { createParticipantCache } from './stream/participantCache';
import { createRequireAdmin, createRequireParticipant, createRequireParticipantOrSelf } from './middleware/requireParticipant';

export interface MessagingContainer {
  init(): Promise<void>;
  pgPool: Pool;
  redis: Redis;
  storage: ReturnType<typeof createStorageClient>;
  metrics: import('../observability/metrics').MessagingMetrics;
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
  // Get metrics from app (already decorated in buildServer)
  const metrics = app.messagingMetrics;

  // Create shared clients with instrumentation
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const pgPool = new Pool({
    connectionString: config.POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:5432/messaging',
    application_name: 'messaging-service',
    max: isTest ? 2 : config.POSTGRES_POOL_MAX,
    min: isTest ? 0 : config.POSTGRES_POOL_MIN,
    idleTimeoutMillis: isTest ? 500 : 30000,
    connectionTimeoutMillis: 2000,
    allowExitOnIdle: false, // we control shutdown via onClose
  });
  
  // Track pool state every 10s (unref so it doesn't keep process alive)
  const poolMetricsInterval = setInterval(() => {
    metrics.poolTotalCount.set(pgPool.totalCount);
    metrics.poolIdleCount.set(pgPool.idleCount);
    metrics.poolWaitingCount.set(pgPool.waitingCount);
  }, 10000);
  poolMetricsInterval.unref();

  // Track acquisition timing
  const originalConnect = pgPool.connect.bind(pgPool);
  pgPool.connect = async function(...args: Parameters<typeof originalConnect>) {
    const startAcquire = Date.now();
    try {
      const client = await originalConnect(...args);
      const waitMs = Date.now() - startAcquire;
      metrics.poolAcquireWaitMs.observe(waitMs);
      const timeoutMs = config.POSTGRES_STATEMENT_TIMEOUT_MS;
      if (timeoutMs > 0) {
        await client.query('SET statement_timeout = $1', [timeoutMs]);
      }
      return client;
    } catch (err) {
      const error = err as Error;
      if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        metrics.poolAcquireTimeouts.inc();
        metrics.poolConnectErrors.labels({ error_type: 'timeout' }).inc();
      } else {
        metrics.poolConnectErrors.labels({ error_type: 'other' }).inc();
      }
      throw err;
    }
  };

  // Cleanup interval on shutdown
  // lgtm[js/missing-rate-limiting] - Shutdown lifecycle hook, not a route handler
  app.addHook('onClose', async () => {
    clearInterval(poolMetricsInterval);
    // Hard close pg pool - terminates all connections and sockets
    try {
      await pgPool.end();
      app.log.debug('pgPool ended');
    } catch (err) {
      app.log.warn({ err }, 'pgPool.end() failed');
    }
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
      metrics,
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
      metrics,
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
    const enforcementEnabled = config.PARTICIPANT_ENFORCEMENT_ENABLED !== false;
    if (enforcementEnabled) {
      const participantsReadPort = (app as unknown as { participantsReadPort?: unknown }).participantsReadPort;
      const requireParticipant = createRequireParticipant(participantCache, participantsReadPort);
      const requireAdmin = createRequireAdmin(participantCache, participantsReadPort);
      const requireParticipantOrSelf = createRequireParticipantOrSelf(participantCache, participantsReadPort);
      app.decorate('participantEnforcement', {
        requireParticipant,
        requireAdmin,
        requireParticipantOrSelf,
      });
      app.log.info('participant enforcement enabled');
    } else {
      app.log.warn('participant enforcement disabled via config');
    }

    if (dispatcher) {
      app.decorate('dispatcher', dispatcher);
    }
    if (consumer) {
      app.decorate('consumer', consumer);
    }
    
    // Stop participant cache on shutdown
    // lgtm[js/missing-rate-limiting] - Shutdown lifecycle hook, not a route handler
    app.addHook('onClose', async () => {
      await participantCache.stop();
      
      // Hard close Redis connections - graceful quit waits for pending replies
      try {
        redisSubscriber.removeAllListeners();
        await redisSubscriber.quit();
        app.log.debug('redisSubscriber quit');
      } catch (err) {
        app.log.warn({ err }, 'redisSubscriber.quit() failed');
      }
      
      try {
        redis.removeAllListeners();
        await redis.quit();
       
        app.log.debug('redis quit');
      } catch (err) {
        app.log.warn({ err }, 'redis.quit() failed');
      }
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
    metrics,
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
