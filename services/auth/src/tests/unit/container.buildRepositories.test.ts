import { describe, expect, it, vi } from 'vitest';
import { createContainer } from '../../container';

const baseConfig = {
  STORAGE_DRIVER: 'memory',
  DEVICE_MAX_PER_ACCOUNT: 5,
  PAIRING_TOKEN_TTL_SECONDS: 60,
  ARGON2_TIME_COST: 1,
  ARGON2_MEMORY_COST: 1,
  ARGON2_PARALLELISM: 1,
  RECOVERY_CODE_VERSION: 1,
  RECOVERY_BACKUP_DUMMY_CIPHER_BYTES: 1,
  RECOVERY_BACKUP_DUMMY_NONCE_BYTES: 1,
  RECOVERY_BACKUP_DUMMY_SALT_BYTES: 1,
  RECOVERY_BACKUP_DUMMY_AD_BYTES: 1,
  RECOVERY_BACKUP_ARGON_TIME_COST: 1,
  RECOVERY_BACKUP_ARGON_MEMORY_COST: 1,
  RECOVERY_BACKUP_ARGON_PARALLELISM: 1,
  RECOVERY_BACKUP_MIN_LATENCY_MS: 1,
  RECOVERY_ARGON_MIN_MEMORY_DESKTOP: 1,
  RECOVERY_ARGON_MIN_MEMORY_MOBILE: 1,
  RECOVERY_ARGON_MIN_TIME_COST: 1,
  RECOVERY_ARGON_MIN_PARALLELISM: 1,
  RECOVERY_BACKUP_RETAIN_BLOBS: 1,
  HTTP_HOST: '127.0.0.1',
  HTTP_PORT: 8081,
  JWT_ISSUER: 'test',
  JWT_AUDIENCE: 'test',
  JWT_ACCESS_TTL_SECONDS: 3600,
  JWT_REFRESH_TTL_SECONDS: 7200,
  TURNSTILE_SECRET: 'secret',
  CAPTCHA_MIN_SCORE: 0,
  CAPTCHA_REQUIRED_ACTIONS: [],
  RECOVERY_KMS_PEPPER: undefined,
  REDIS_URL: undefined
} as any;

const logger = { child: vi.fn().mockReturnThis(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

describe('container buildRepositories', () => {
  it('builds memory repositories when storage driver is memory', async () => {
    const container = await createContainer({ config: { ...baseConfig }, logger });
    expect(container.repos.accounts).toBeDefined();
    expect(container.services.devices).toBeDefined();
  });
});

