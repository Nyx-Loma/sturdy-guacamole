import { Pool } from 'pg';
import Redis from 'ioredis';
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

export interface MessagingContainer {
  init(): Promise<void>;
  pgPool: Pool;
  redis: Redis;
  storage: ReturnType<typeof createStorageClient>;
  dispatcher?: Dispatcher;
  consumer?: Consumer;
}

export const createMessagingContainer = async (
  app: FastifyInstance,
  config: MessagingConfig,
  hub?: any // WebSocketHub type from @sanctum/transport
): Promise<MessagingContainer> => {
  // Create shared clients
  const pgPool = new Pool({
    connectionString: config.POSTGRES_URL ?? 'postgres://postgres:postgres@localhost:5432/messaging',
    application_name: 'messaging-service',
    max: 20,
  });

  const redis = new Redis(config.REDIS_STREAM_URL ?? config.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: false,
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

  const messageService = createMessageService({
    read: app.messagesReadPort,
    write: app.messagesWritePort,
    events: app.conversationsEventsPort,
  });

  const conversationService = createConversationService({
    read: app.conversationsReadPort,
    write: app.conversationsWritePort,
    events: app.conversationsEventsPort,
  });

  const init = async () => {
    await redis.connect();
    app.decorate('pgPool', pgPool);
    app.decorate('redis', redis);
    app.decorate('storage', storage);
    app.decorate('messageService', messageService);
    app.decorate('conversationService', conversationService);
    if (dispatcher) {
      app.decorate('dispatcher', dispatcher);
    }
    if (consumer) {
      app.decorate('consumer', consumer);
    }
  };

  return {
    init,
    pgPool,
    redis,
    storage,
    dispatcher,
    consumer,
  };
};

declare module 'fastify' {
  interface FastifyInstance {
    pgPool: Pool;
    redis: Redis;
    storage: ReturnType<typeof createStorageClient>;
    dispatcher?: Dispatcher;
    consumer?: Consumer;
  }
}
