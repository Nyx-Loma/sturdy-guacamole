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
  TURNSTILE_SECRET: 'secret',
  CAPTCHA_MIN_SCORE: 0,
  CAPTCHA_REQUIRED_ACTIONS: [],
  RECOVERY_KMS_PEPPER: undefined,
  REDIS_URL: undefined
} as any;

const logger = { child: vi.fn().mockReturnThis(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;

// Provide a fake ioredis client for tests
const makeFakeRedis = () => {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    getdel: vi.fn(async (key: string) => {
      const val = store.get(key) ?? null;
      if (val !== null) store.delete(key);
      return val;
    }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    quit: vi.fn(async () => undefined)
  } as any;
};

describe('container redis wiring', () => {
  it('uses memory stores without REDIS_URL', async () => {
    const container = await createContainer({ config: { ...baseConfig }, logger });
    // verify deviceAssertion service is composed and exposes expected methods
    expect(container.services.deviceAssertion).toBeDefined();
    expect(typeof container.services.deviceAssertion.generateNonce).toBe('function');
    expect(typeof container.services.deviceAssertion.verify).toBe('function');
  });

  it('uses redis stores when REDIS_URL provided', async () => {
    const fakeRedis = makeFakeRedis();
    const mod = await import('../../adapters/redis');
    const getRedisSpy = vi.spyOn(mod, 'getRedisClient').mockReturnValue(fakeRedis as any);
    const container = await createContainer({ config: { ...baseConfig, REDIS_URL: 'redis://localhost:6379' }, logger });
    expect(getRedisSpy).toHaveBeenCalled();
    // pairing cache should be configured; exercise pairing service path (no throw)
    const token = await container.services.pairing.init('a', 'b');
    expect(token.token).toBeDefined();
  });
});


