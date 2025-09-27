import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getRedisClient, closeRedisClient } from '../../../adapters/redis/client';

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({ quit: vi.fn() }))
  };
});

const makeConfig = (overrides: Partial<import('../../../config').Config> = {}) => ({
  REDIS_URL: 'redis://localhost:6379',
  ...overrides
} as any);

describe('redis client adapter', () => {
  beforeEach(async () => {
    await closeRedisClient();
    vi.clearAllMocks();
  });

  it('throws when redis url not configured', () => {
    expect(() => getRedisClient(makeConfig({ REDIS_URL: undefined }))).toThrow('REDIS_URL is not configured');
  });

  it('creates client lazily and reuses singleton', () => {
    const config = makeConfig();
    const first = getRedisClient(config);
    const second = getRedisClient(config);
    expect(first).toBe(second);
  });
});
