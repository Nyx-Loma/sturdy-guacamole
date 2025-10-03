import { Pool } from 'pg';
import Redis from 'ioredis';
import { createStorageClient } from '@sanctum/storage';
import { PostgresRecordAdapter } from '@sanctum/storage/adapters/postgres';
import { RedisStreamAdapter } from '@sanctum/storage/adapters/redisStream';
import type { MessagingConfig } from '../config';

export const createPgPool = (config: MessagingConfig) => {
  if (!config.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is required to create PgPool');
  }
  return new Pool({ connectionString: config.POSTGRES_URL, application_name: 'messaging-service' });
};

export const createRedisClient = (config: MessagingConfig) => {
  const url = config.REDIS_STREAM_URL ?? config.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_STREAM_URL or REDIS_URL must be provided');
  }
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    enableOfflineQueue: false
  });
};

export const createMessagingStorage = async (config: MessagingConfig) => {
  const storage = createStorageClient(
    {
      schemaVersion: 1,
      recordAdapters: [
        {
          namespaces: ['messages', 'conversations'],
          adapter: new PostgresRecordAdapter({
            dsn: config.POSTGRES_URL!,
            schema: config.POSTGRES_SCHEMA,
            table: config.POSTGRES_TABLE_MESSAGES
          })
        }
      ],
      streamAdapters: [
        {
          namespaces: [config.REDIS_STREAM_NAMESPACE],
          adapter: new RedisStreamAdapter({
            redisUrl: config.REDIS_STREAM_URL ?? config.REDIS_URL!,
            streamPrefix: config.REDIS_STREAM_PREFIX,
            groupPrefix: config.REDIS_STREAM_GROUP_PREFIX,
            consumerName: config.REDIS_CONSUMER_NAME,
            readCount: config.REDIS_STREAM_BATCH_SIZE,
            blockTimeoutMs: config.REDIS_STREAM_BLOCK_MS,
            maxLen: config.REDIS_STREAM_MAXLEN
          })
        }
      ]
    },
    {
      logger: undefined
    }
  );
  await storage.init();
  return storage;
};
