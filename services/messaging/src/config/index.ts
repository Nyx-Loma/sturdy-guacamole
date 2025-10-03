import { z } from 'zod';

const BOOL = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value === 'true';
  });

const NUMBER_FROM_STRING = (schema: z.ZodNumber = z.number()) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return typeof value === 'number' ? value : Number.parseInt(value, 10);
    })
    .pipe(schema);

const UUID_SCHEMA = z
  .string()
  .uuid();

export const MessagingConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HTTP_HOST: z.string().default('0.0.0.0'),
    HTTP_PORT: NUMBER_FROM_STRING(z.number().int().positive()).default(8083),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    STORAGE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
    MESSAGING_USE_STORAGE: z.enum(['on', 'off']).default('off'),
    POSTGRES_URL: z.string().url().optional(),
    POSTGRES_SCHEMA: z.string().default('messaging'),
    POSTGRES_TABLE_MESSAGES: z.string().default('messages'),
    REDIS_URL: z.string().url().optional(),
    REDIS_STREAM_URL: z.string().url().optional(),
    REDIS_STREAM_NAMESPACE: z.string().default('message-streams'),
    REDIS_STREAM_STREAM_NAME: z.string().default('events'),
    REDIS_STREAM_PREFIX: z.string().default('sanctum:message-stream'),
    REDIS_STREAM_GROUP_PREFIX: z.string().default('sanctum:message-group'),
    REDIS_CONSUMER_NAME: z.string().default('messaging-dispatcher'),
    REDIS_STREAM_BATCH_SIZE: NUMBER_FROM_STRING(z.number().int().positive()).default(500),
    REDIS_STREAM_BLOCK_MS: NUMBER_FROM_STRING(z.number().int().positive()).default(2_000),
    REDIS_STREAM_MAXLEN: NUMBER_FROM_STRING(z.number().int().positive()).default(1_000_000),
    DISPATCHER_ENABLED: BOOL.default(false),
    DISPATCH_TICK_MS: NUMBER_FROM_STRING(z.number().int().positive()).default(100),
    DISPATCH_BATCH_SIZE: NUMBER_FROM_STRING(z.number().int().positive()).default(256),
    DISPATCH_MAX_ATTEMPTS: NUMBER_FROM_STRING(z.number().int().positive()).default(10),
    DISPATCH_STREAM_NAME: z.string().default('sanctum:messages'),
    CONSUMER_ENABLED: BOOL.default(false),
    CONSUMER_GROUP_NAME: z.string().default('messaging-hub'),
    CONSUMER_NAME: z.string().default('consumer-1'),
    CONSUMER_BATCH_SIZE: NUMBER_FROM_STRING(z.number().int().positive()).default(128),
    CONSUMER_BLOCK_MS: NUMBER_FROM_STRING(z.number().int().positive()).default(1000),
    DISPATCH_WORKERS: NUMBER_FROM_STRING(z.number().int().positive()).default(8),
    DISPATCH_MAX_RETRIES: NUMBER_FROM_STRING(z.number().int().positive()).default(5),
    DISPATCH_RETRY_BASE_MS: NUMBER_FROM_STRING(z.number().int().positive()).default(250),
    DISPATCH_QUEUE_CAPACITY: NUMBER_FROM_STRING(z.number().int().positive()).default(1_000),
    OUTBOX_RETENTION_DAYS: NUMBER_FROM_STRING(z.number().int().positive()).default(7),
    DLQ_RETENTION_DAYS: NUMBER_FROM_STRING(z.number().int().positive()).default(30),
    WEBSOCKET_PORT: NUMBER_FROM_STRING(z.number().int().positive()).default(8090),
    WEBSOCKET_HOST: z.string().default('0.0.0.0'),
    WEBSOCKET_HEARTBEAT_INTERVAL_MS: NUMBER_FROM_STRING(z.number().int().positive()).default(30_000),
    WEBSOCKET_MAX_CLIENTS: NUMBER_FROM_STRING(z.number().int().positive()).default(10_000),
    WEBSOCKET_MAX_PAYLOAD_BYTES: NUMBER_FROM_STRING(z.number().int().positive()).default(64 * 1024),
    PAYLOAD_MAX_BYTES: NUMBER_FROM_STRING(z.number().int().positive().max(256 * 1024)).default(65_536),
    IDEMPOTENCY_TTL_HOURS: NUMBER_FROM_STRING(z.number().int().positive().max(168)).default(24),
    IDEMPOTENCY_SCOPE: z.enum(['conversation', 'sender']).default('conversation'),
    RATE_LIMIT_MAX: NUMBER_FROM_STRING(z.number().int().positive()).default(120),
    RATE_LIMIT_INTERVAL_MS: NUMBER_FROM_STRING(z.number().int().positive()).default(60_000),
    RATE_LIMIT_BURST: NUMBER_FROM_STRING(z.number().int().positive()).default(60),
    RATE_LIMIT_PER_DEVICE: NUMBER_FROM_STRING(z.number().int().positive()).default(30),
    RATE_LIMIT_PER_SESSION: NUMBER_FROM_STRING(z.number().int().positive()).default(30),
    RATE_LIMIT_PER_USER: NUMBER_FROM_STRING(z.number().int().positive()).default(60),
    ENABLE_CONSISTENCY_OVERRIDE: BOOL.default(false),
    ENABLE_PAYLOAD_FINGERPRINT: BOOL.default(true),
    STRONG_READ_CACHE_TTL_MS: NUMBER_FROM_STRING(z.number().int().nonnegative()).default(0),
    EVENTUAL_READ_CACHE_TTL_MS: NUMBER_FROM_STRING(z.number().int().nonnegative()).default(30_000),
    UUID_NAMESPACE: UUID_SCHEMA.optional()
  })
  .superRefine((cfg, ctx) => {
    if (cfg.MESSAGING_USE_STORAGE === 'on' && cfg.STORAGE_DRIVER !== 'postgres') {
      ctx.addIssue({
        path: ['STORAGE_DRIVER'],
        code: z.ZodIssueCode.custom,
        message: 'STORAGE_DRIVER must be postgres when MESSAGING_USE_STORAGE=on'
      });
    }
    if (cfg.MESSAGING_USE_STORAGE === 'on' && !cfg.POSTGRES_URL) {
      ctx.addIssue({
        path: ['POSTGRES_URL'],
        code: z.ZodIssueCode.custom,
        message: 'POSTGRES_URL is required when MESSAGING_USE_STORAGE=on'
      });
    }
    if (cfg.MESSAGING_USE_STORAGE === 'on' && !(cfg.REDIS_URL || cfg.REDIS_STREAM_URL)) {
      ctx.addIssue({
        path: ['REDIS_STREAM_URL'],
        code: z.ZodIssueCode.custom,
        message: 'REDIS_STREAM_URL or REDIS_URL is required when MESSAGING_USE_STORAGE=on'
      });
    }
  });

export type MessagingConfig = z.infer<typeof MessagingConfigSchema>;

let cached: MessagingConfig | undefined;

export const loadConfig = (): MessagingConfig => {
  if (!cached) {
    cached = MessagingConfigSchema.parse(process.env);
  }
  return cached;
};

export const resetConfigForTests = () => {
  cached = undefined;
};


