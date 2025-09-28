import { z } from 'zod';
import { randomBytes } from 'node:crypto';

const generateSecret = () => randomBytes(32).toString('base64url');

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HTTP_PORT: z.coerce.number().int().positive().default(3000),
  HTTP_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  REFRESH_TOKEN_TTL_MS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60 * 1000),
  PAIRING_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  DEVICE_MAX_PER_ACCOUNT: z.coerce.number().int().positive().default(5),
  DEVICE_MAX_PER_ACCOUNT_LIMIT_OVERRIDE: z.coerce.number().int().positive().optional(),
  STORAGE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
  POSTGRES_URL: z.string().optional(),
  POSTGRES_SCHEMA: z.string().default('auth'),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().default(() => generateSecret()),
  JWT_ACTIVE_KID: z.string().default('primary'),
  JWT_SECONDARY_SECRET: z.string().optional(),
  JWT_SECONDARY_KID: z.string().optional(),
  JWT_SECONDARY_NOT_AFTER: z.coerce.number().int().positive().optional(),
  JWT_SIGNING_ALG: z.enum(['HS256']).default('HS256'),
  JWT_ROTATION_LEEWAY_SECONDS: z.coerce.number().int().nonnegative().default(300),
  JWT_ISSUER: z.string().default('arqivo-auth'),
  JWT_AUDIENCE: z.string().default('arqivo-client'),
  KMS_ENDPOINT: z.string().optional(),
  CAPTCHA_PROVIDER: z.enum(['none', 'turnstile']).default('none'),
  CAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  CAPTCHA_REQUIRED_ACTIONS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : []
    ),
  CAPTCHA_BYPASS_SECRET: z.string().optional(),
  TURNSTILE_SECRET: z.string().optional(),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(1024),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),
  ARGON2_SALT_LENGTH: z.coerce.number().int().positive().default(16),
  ARGON2_KEY_LENGTH: z.coerce.number().int().positive().default(32),
  RECOVERY_CODE_VERSION: z.coerce.number().int().positive().default(1),
  RECOVERY_BACKUP_DUMMY_CIPHER_BYTES: z.coerce.number().int().positive().default(512),
  RECOVERY_BACKUP_DUMMY_NONCE_BYTES: z.coerce.number().int().positive().default(24),
  RECOVERY_BACKUP_DUMMY_SALT_BYTES: z.coerce.number().int().positive().default(32),
  RECOVERY_BACKUP_DUMMY_AD_BYTES: z.coerce.number().int().positive().default(32),
  RECOVERY_BACKUP_ARGON_TIME_COST: z.coerce.number().int().positive().default(3),
  RECOVERY_BACKUP_ARGON_MEMORY_COST: z.coerce.number().int().positive().default(262144),
  RECOVERY_BACKUP_ARGON_PARALLELISM: z.coerce.number().int().positive().default(2),
  RECOVERY_BACKUP_MIN_LATENCY_MS: z.coerce.number().int().nonnegative().default(60),
  RECOVERY_ARGON_MIN_MEMORY_DESKTOP: z.coerce.number().int().positive().default(524288),
  RECOVERY_ARGON_MIN_MEMORY_MOBILE: z.coerce.number().int().positive().default(262144),
  RECOVERY_ARGON_MIN_TIME_COST: z.coerce.number().int().positive().default(3),
  RECOVERY_ARGON_MIN_PARALLELISM: z.coerce.number().int().positive().default(2),
  RECOVERY_BACKUP_RETAIN_BLOBS: z.coerce.number().int().positive().default(2),
  RECOVERY_KMS_PEPPER: z.string().optional()
}).superRefine((cfg, ctx) => {
  if (cfg.STORAGE_DRIVER === 'postgres' && !cfg.POSTGRES_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['POSTGRES_URL'],
      message: 'POSTGRES_URL is required when STORAGE_DRIVER=postgres'
    });
  }
});

export type Config = z.infer<typeof ConfigSchema>;

let config: Config | undefined;

export const loadConfig = (): Config => {
  if (!config) {
    config = ConfigSchema.parse(process.env);
  }
  return config;
};

export const resetConfigForTests = () => {
  config = undefined;
};


