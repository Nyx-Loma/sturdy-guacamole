import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigForTests } from '../../config';

describe('config loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfigForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfigForTests();
  });

  it('loads defaults when env not set', () => {
    delete process.env.HTTP_PORT;
    delete process.env.HTTP_HOST;
    const config = loadConfig();
    expect(config.HTTP_PORT).toBe(3000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.ACCESS_TOKEN_TTL_SECONDS).toBe(300);
    expect(config.PAIRING_TOKEN_TTL_SECONDS).toBe(120);
    expect(config.STORAGE_DRIVER).toBe('memory');
    expect(config.RECOVERY_BACKUP_MIN_LATENCY_MS).toBe(60);
    expect(config.RECOVERY_ARGON_MIN_MEMORY_DESKTOP).toBeGreaterThan(config.RECOVERY_ARGON_MIN_MEMORY_MOBILE);
  });

  it('throws on invalid env', () => {
    process.env.HTTP_PORT = '-1';
    expect(() => loadConfig()).toThrow();
  });

  it('requires postgres url when storage driver set to postgres', () => {
    process.env.STORAGE_DRIVER = 'postgres';
    delete process.env.POSTGRES_URL;
    expect(() => loadConfig()).toThrow('POSTGRES_URL is required when STORAGE_DRIVER=postgres');
  });

  it('respects recovery argon floors from env', () => {
    process.env.RECOVERY_ARGON_MIN_MEMORY_DESKTOP = '1048576';
    process.env.RECOVERY_ARGON_MIN_MEMORY_MOBILE = '524288';
    process.env.RECOVERY_ARGON_MIN_TIME_COST = '4';
    process.env.RECOVERY_ARGON_MIN_PARALLELISM = '3';
    const config = loadConfig();
    expect(config.RECOVERY_ARGON_MIN_MEMORY_DESKTOP).toBe(1_048_576);
    expect(config.RECOVERY_ARGON_MIN_MEMORY_MOBILE).toBe(524_288);
    expect(config.RECOVERY_ARGON_MIN_TIME_COST).toBe(4);
    expect(config.RECOVERY_ARGON_MIN_PARALLELISM).toBe(3);
  });

  it('allows overriding storage driver to postgres when url provided', () => {
    process.env.STORAGE_DRIVER = 'postgres';
    process.env.POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';
    const config = loadConfig();
    expect(config.STORAGE_DRIVER).toBe('postgres');
    expect(config.POSTGRES_URL).toBe('postgres://user:pass@localhost:5432/db');
  });

  it('enables redis options when REDIS_URL provided', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const config = loadConfig();
    expect(config.REDIS_URL).toBe('redis://localhost:6379');
  });

  it('parses device limit and pairing ttl from environment', () => {
    process.env.DEVICE_MAX_PER_ACCOUNT = '7';
    process.env.PAIRING_TOKEN_TTL_SECONDS = '360';
    const config = loadConfig();
    expect(config.DEVICE_MAX_PER_ACCOUNT).toBe(7);
    expect(config.PAIRING_TOKEN_TTL_SECONDS).toBe(360);
  });

  it('parses captcha required actions when provided', () => {
    process.env.CAPTCHA_REQUIRED_ACTIONS = 'login,signup , recover ';
    const config = loadConfig();
    expect(config.CAPTCHA_REQUIRED_ACTIONS).toEqual(['login', 'signup', 'recover']);
  });

  it('sets captcha provider to none when unspecified', () => {
    delete process.env.CAPTCHA_PROVIDER;
    const config = loadConfig();
    expect(config.CAPTCHA_PROVIDER).toBe('none');
    expect(config.CAPTCHA_REQUIRED_ACTIONS).toEqual([]);
  });

  it('accepts redis queue url without enabling queue', () => {
    process.env.REDIS_QUEUE_URL = 'redis://localhost:6381';
    const config = loadConfig();
    expect(process.env.REDIS_QUEUE_URL).toBe('redis://localhost:6381');
    expect((config as any).QUEUE_ENABLED).toBeUndefined();
  });
});


