import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().positive().default(8082),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  STORAGE_DRIVER: z.enum(['memory', 'postgres']).default('memory'),
  POSTGRES_URL: z.string().url().optional(),
  DIRECTORY_API_KEY: z.string().optional(),
  DIRECTORY_REQUIRE_API_KEY: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  HASHED_EMAIL_LOOKUP_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  HASHED_EMAIL_SALT: z.string().optional()
});

export type Config = z.infer<typeof ConfigSchema>;

let config: Config | undefined;

export const loadConfig = (): Config => {
  if (!config) {
    const parsed = ConfigSchema.parse(process.env);
    config = {
      ...parsed,
      HASHED_EMAIL_LOOKUP_ENABLED: parsed.HASHED_EMAIL_LOOKUP_ENABLED ?? false
    };
  }
  return config;
};

export const resetConfigForTests = () => {
  config = undefined;
};


