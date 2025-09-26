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
});


