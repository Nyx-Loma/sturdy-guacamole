import { z } from 'zod';

export const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KMS_KEY_ID: z.string().min(1),
  CAPTCHA_SITE_KEY: z.string().min(1),
  CAPTCHA_SECRET_KEY: z.string().min(1),
  APPLE_DEVICECHECK_KEY_ID: z.string().optional(),
  APPLE_DEVICECHECK_TEAM_ID: z.string().optional(),
  APPLE_DEVICECHECK_PRIVATE_KEY_PATH: z.string().optional(),
  GOOGLE_PLAY_INTEGRITY_CREDENTIALS_PATH: z.string().optional(),
  AWS_REGION: z.string().min(1),
  SERVER_HOST: z.string().default('127.0.0.1'),
  SERVER_PORT: z
    .string()
    .default('3000')
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1).max(65535)),
  WS_DEV_TOKEN: z.string().min(1),
  WS_RATE_LIMIT_CONNECTIONS_PER_MIN: z
    .string()
    .default('60')
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1)),
  WS_RATE_LIMIT_MESSAGES_PER_MIN: z
    .string()
    .default('600')
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1)),
  WS_MAX_BUFFERED_BYTES: z
    .string()
    .default(String(5 * 1024 * 1024))
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1024)),
  WS_HEARTBEAT_INTERVAL_MS: z
    .string()
    .default(String(60_000))
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(1000)),
  WS_RESUME_TTL_MS: z
    .string()
    .default(String(15 * 60_000))
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(60_000)),
  QUEUE_STREAM_KEY: z.string().min(1),
  QUEUE_GROUP: z.string().min(1),
  QUEUE_CONSUMER_NAME: z.string().min(1),
  REDIS_QUEUE_URL: z.string().url(),
  QUEUE_ENABLED: z
    .string()
    .default('true')
    .transform((value) => value === 'true')
});

export type Config = z.infer<typeof schema>;

let cachedConfig: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.message}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

export function resetConfig() {
  cachedConfig = null;
}

