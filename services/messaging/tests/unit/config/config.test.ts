import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, resetConfigForTests } from '../../../src/config';

const ORIGINAL_ENV = { ...process.env };

describe('MessagingConfig', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NODE_ENV;
    delete process.env.MESSAGING_USE_STORAGE;
    delete process.env.STORAGE_DRIVER;
    delete process.env.POSTGRES_URL;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_STREAM_URL;
    // Set required JWT config
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-audience';
    process.env.JWT_PUBLIC_KEY = 'fake-public-key-for-testing';
    resetConfigForTests();
  });

  it('applies defaults when env is empty', () => {
    const cfg = loadConfig();
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.HTTP_PORT).toBe(8083);
    expect(cfg.REDIS_STREAM_PREFIX).toBe('sanctum:message-stream');
    expect(cfg.PARTICIPANT_CACHE_ENABLED).toBe(true);
  });

  it('supports env overrides', () => {
    process.env.HTTP_PORT = '9090';
    process.env.REDIS_STREAM_PREFIX = 'custom:prefix';
    resetConfigForTests();
    const cfg = loadConfig();
    expect(cfg.HTTP_PORT).toBe(9090);
    expect(cfg.REDIS_STREAM_PREFIX).toBe('custom:prefix');
  });

  it('validates storage preconditions when messaging storage is on', () => {
    process.env.MESSAGING_USE_STORAGE = 'on';
    process.env.STORAGE_DRIVER = 'memory';
    resetConfigForTests();
    expect(() => loadConfig()).toThrow(/STORAGE_DRIVER must be postgres/);
  });

  it('requires POSTGRES_URL when storage is on', () => {
    process.env.MESSAGING_USE_STORAGE = 'on';
    process.env.STORAGE_DRIVER = 'postgres';
    resetConfigForTests();
    expect(() => loadConfig()).toThrow(/POSTGRES_URL is required/);
  });

  it('requires a redis url when storage is on', () => {
    process.env.MESSAGING_USE_STORAGE = 'on';
    process.env.STORAGE_DRIVER = 'postgres';
    process.env.POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';
    resetConfigForTests();
    expect(() => loadConfig()).toThrow(/REDIS_STREAM_URL or REDIS_URL is required/);
  });

  it('passes validation when storage is on and urls provided', () => {
    process.env.MESSAGING_USE_STORAGE = 'on';
    process.env.STORAGE_DRIVER = 'postgres';
    process.env.POSTGRES_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.REDIS_STREAM_URL = 'redis://localhost:6379';
    resetConfigForTests();
    const cfg = loadConfig();
    expect(cfg.MESSAGING_USE_STORAGE).toBe('on');
    expect(cfg.STORAGE_DRIVER).toBe('postgres');
    expect(cfg.POSTGRES_URL).toBeTruthy();
  });
});


